import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

import hosted_apply as h

INSTANCE, TENANT, PLAN, JOB, APP, SPACE, TEMPLATE, SOURCE, COPY, TASK, SLOT, LOCK = [
    f"{n:08x}-1111-4111-8111-111111111111" for n in range(1, 13)]


def utc(t): return datetime.fromtimestamp(t, timezone.utc).isoformat().replace("+00:00", "Z")


def binding():
    return {"version": 1, "instanceId": INSTANCE, "tenantId": TENANT, "planId": PLAN,
        "runnerSpace": SPACE, "runnerTemplate": TEMPLATE, "sourceDropletId": SOURCE,
        "backendSha256": "b" * 64, "creates": 8,
        "backend": {"bucket": "synthetic-state", "key": f"applications/{TENANT}/{INSTANCE}/terraform.tfstate",
            "endpoint": h.ENDPOINT, "region": "eu01", "useLockfile": True}}


def event():
    return {"event": "application_apply_candidate", "instanceId": INSTANCE, "planId": PLAN, "jobId": JOB,
        "appId": APP, "sourceDropletId": SOURCE, "backendSha256": "b" * 64,
        "jobCreatedAt": utc(time.time() - .5), "observedAt": utc(time.time()), "status": "applying"}


class Reader:
    def __init__(self):
        self.state = {"version": 4, "serial": 2, "resources": [
            {"mode": "managed", "type": "terraform_data", "name": "contract", "instances": [{"attributes": {"input": INSTANCE}}]},
            {"mode": "managed", "module": "module.application", "type": "stackit_resourcemanager_project", "name": "this",
                "instances": [{"attributes": {"id": "synthetic-project", "private": "private-state-canary"}}]}]}
        self.lock = {"ID": LOCK, "Operation": "OperationTypeApply", "Version": "1.12.6",
            "Path": "synthetic-state/" + binding()["backend"]["key"], "Created": utc(time.time())}
        self.reads = []

    def read(self, key):
        self.reads.append(key)
        doc = self.lock if key.endswith(".tflock") else self.state
        return (json.dumps(doc).encode(), "test-version") if doc is not None else None


class ApplyCheckpointTests(unittest.TestCase):
    def test_real_partial_checkpoint_without_exporting_state(self):
        r = Reader(); result = h.checkpoint(r, binding(), time.time() - 1)
        self.assertEqual(result["managedResources"], 2)
        self.assertEqual(result["cloudResources"], 1)
        self.assertNotIn("private-state-canary", json.dumps(result))
        self.assertEqual(len(r.reads), 4)

    def test_refuses_missing_unlocked_changed_foreign_or_completed_state(self):
        for kind in ["missing", "unlocked", "foreign", "data-only", "no-project", "complete", "deposed", "tainted", "wrong-operation", "wrong-version", "foreign-lock", "old-lock", "future-lock"]:
            with self.subTest(kind=kind):
                r, b = Reader(), binding()
                if kind == "missing": r.state = None
                if kind == "unlocked": r.lock = None
                if kind == "foreign": r.state["resources"][0]["instances"][0]["attributes"]["input"] = TENANT
                if kind == "data-only": r.state["resources"][1]["mode"] = "data"
                if kind == "no-project": r.state["resources"][1]["type"] = "stackit_network"
                if kind == "complete": b["creates"] = 2
                if kind in ["deposed", "tainted"]: r.state["resources"][1]["instances"][0]["deposed" if kind == "deposed" else "status"] = "replaced" if kind == "deposed" else "tainted"
                if kind == "wrong-operation": r.lock["Operation"] = "OperationTypePlan"
                if kind == "wrong-version": r.lock["Version"] = "1.11.0"
                if kind == "foreign-lock": r.lock["Path"] = "other/key"
                if kind == "old-lock": r.lock["Created"] = utc(time.time() - 100)
                if kind == "future-lock": r.lock["Created"] = utc(time.time() + 100)
                self.assertIsNone(h.checkpoint(r, b, time.time() - 1))
        r = Reader(); original = r.read
        def changed(key):
            result = original(key)
            return (result[0], "different-version") if len(r.reads) == 3 else result
        r.read = changed
        self.assertIsNone(h.checkpoint(r, binding(), time.time() - 1))

    def test_candidate_binds_fresh_new_apply_to_exact_instance_plan_source_and_backend(self):
        e, b, now = event(), binding(), time.time()
        self.assertEqual(h.candidate(e, b, now - 1, now), e)
        changes = [{"instanceId": TENANT}, {"planId": JOB}, {"sourceDropletId": COPY}, {"backendSha256": "c"*64},
            {"jobId": "invalid"}, {"status": "succeeded"}, {"status": "planning"}, {"observedAt": utc(now - 5)},
            {"jobCreatedAt": utc(now - 2)}, {"observedAt": utc(now + 10)}, {"extra": "untrusted"}]
        for change in changes:
            with self.subTest(change=change): self.assertIsNone(h.candidate({**e, **change}, b, now - 1, now))

    def test_private_binding_cannot_target_another_namespace_or_noninitial_plan(self):
        with tempfile.TemporaryDirectory() as root:
            p = Path(root) / "binding.json"
            for change in [{}, {"instanceId": TENANT}, {"creates": 0}, {"creates": True}, {"unknown": "value"},
                           {"backend": {**binding()["backend"], "key": "other/key"}},
                           {"backend": {**binding()["backend"], "endpoint": "https://production.example"}}]:
                b = {**binding(), **change}; p.write_text(json.dumps(b)); p.chmod(0o600)
                if not change: self.assertEqual(h.binding_file(p, INSTANCE, SPACE, TEMPLATE), b)
                else:
                    with self.assertRaises(ValueError): h.binding_file(p, INSTANCE, SPACE, TEMPLATE)


class ApplyStopTests(unittest.TestCase):
    def fixture(self, warm=True):
        c = object.__new__(h.ApplyController)
        c.instance, c.space, c.template = INSTANCE, SPACE, TEMPLATE
        c.confirm, c.stopped, c.boundary_verified = INSTANCE, False, True
        c.bound, c.reader, c.armed_at = binding(), Reader(), time.time() - 1
        c.snapshot = lambda: event()
        root = tempfile.TemporaryDirectory(); self.addCleanup(root.cleanup)
        c.receipt_path = str(Path(root.name) / "stop.json")
        app = {"guid": APP, "name": "lzc-warm-" + SLOT if warm else "lzc-plan-" + JOB,
            "state": "STARTED" if warm else "STOPPED", "relationships": {"space": {"data": {"guid": SPACE}}}}
        source = {"guid": SOURCE, "state": "STAGED", "checksum": {"type": "sha256", "value": "d"*64}, "relationships": {"app": {"data": {"guid": TEMPLATE}}}}
        current = {**copy.deepcopy(source), "guid": COPY, "relationships": {"app": {"data": {"guid": APP}}}}
        responses = {"/v3/apps/" + APP: app, f"/v3/apps/{APP}/routes": {"pagination": {"next": None}, "resources": []},
            "/v3/droplets/" + SOURCE: source, f"/v3/apps/{APP}/droplets/current": current,
            f"/v3/apps/{APP}/tasks?per_page=100": {"pagination": {"next": None}, "resources": [] if warm else [{"guid": TASK, "name": "initial-plan", "state": "RUNNING"}]},
            f"/v3/apps/{APP}/processes/web/stats": {"resources": [{"state": "RUNNING"}]}}
        calls = []
        def api(path, method="GET"):
            calls.append((path, method))
            if method != "GET": return {}
            return responses[path]
        c.api = api
        return c, responses, calls

    def test_stops_exact_warm_or_task_once_and_never_writes_state_or_unlocks(self):
        for warm in [True, False]:
            with self.subTest(warm=warm):
                c, _, calls = self.fixture(warm)
                cp = h.checkpoint(c.reader, c.bound, c.armed_at)
                c.stop_apply(event(), cp)
                self.assertEqual([(p,m) for p,m in calls if m != "GET"], [(f"/v3/apps/{APP}/actions/stop" if warm else f"/v3/tasks/{TASK}/actions/cancel", "POST")])
                receipt = json.loads(Path(c.receipt_path).read_text())
                self.assertEqual(receipt["phase"], "stop-requested")
                self.assertFalse(receipt["qualifiesRecovery"])
                self.assertNotIn("private-state-canary", json.dumps(receipt))
                with self.assertRaises(RuntimeError): c.stop_apply(event(), cp)

    def test_rejects_other_apps_sources_routes_incomplete_or_inactive_observations(self):
        for kind in ["space", "template", "name", "stopped", "route", "copy-owner", "source-owner", "checksum", "shared-guid", "source-state", "tasks-next", "active-task", "stats-empty", "stats-unknown", "stats-many", "boundary", "unconfirmed"]:
            with self.subTest(kind=kind):
                c, r, calls = self.fixture()
                app, current, source = r["/v3/apps/"+APP], r[f"/v3/apps/{APP}/droplets/current"], r["/v3/droplets/"+SOURCE]
                if kind == "space": app["relationships"]["space"]["data"]["guid"] = TENANT
                if kind == "template": c.template = APP
                if kind == "name": app["name"] = "lzc-plan-" + PLAN
                if kind == "stopped": app["state"] = "STOPPED"
                if kind == "route": r[f"/v3/apps/{APP}/routes"]["resources"] = [{}]
                if kind == "copy-owner": current["relationships"]["app"]["data"]["guid"] = TEMPLATE
                if kind == "source-owner": source["relationships"]["app"]["data"]["guid"] = APP
                if kind == "checksum": current["checksum"]["value"] = "e"*64
                if kind == "shared-guid": current["guid"] = SOURCE
                if kind == "source-state": source["state"] = "COPYING"
                if kind == "tasks-next": r[f"/v3/apps/{APP}/tasks?per_page=100"]["pagination"]["next"] = {}
                if kind == "active-task": r[f"/v3/apps/{APP}/tasks?per_page=100"]["resources"] = [{"state":"RUNNING"}]
                if kind == "stats-empty": r[f"/v3/apps/{APP}/processes/web/stats"]["resources"] = []
                if kind == "stats-unknown": r[f"/v3/apps/{APP}/processes/web/stats"]["resources"][0]["state"] = "UNKNOWN"
                if kind == "stats-many": r[f"/v3/apps/{APP}/processes/web/stats"]["resources"] *= 2
                if kind == "boundary": c.boundary_verified = False
                if kind == "unconfirmed": c.confirm = None
                if kind == "tasks-next": r[f"/v3/apps/{APP}/tasks?per_page=100"]["pagination"]["next"] = {"href":"next"}
                with self.assertRaises((RuntimeError,ValueError)): c.stop_apply(event(), h.checkpoint(c.reader,c.bound,c.armed_at))
                self.assertFalse(any(m != "GET" for _,m in calls))

    def test_changed_or_expired_snapshot_and_changed_checkpoint_do_not_stop(self):
        for kind in ["expired", "changed-app", "changed-state", "finished-after-intent"]:
            with self.subTest(kind=kind):
                c, _, calls = self.fixture(); cp = h.checkpoint(c.reader,c.bound,c.armed_at)
                if kind == "expired": c.snapshot = lambda: None
                if kind == "changed-app": c.snapshot = lambda: {**event(),"appId":TENANT}
                if kind == "changed-state": c.reader.state["serial"] += 1
                if kind == "finished-after-intent":
                    values = iter([event(),event(),None]); c.snapshot = lambda: next(values)
                with self.assertRaises(RuntimeError): c.stop_apply(event(),cp)
                self.assertFalse(any(m != "GET" for _,m in calls))

    def test_existing_or_ambiguous_intent_is_never_replayed(self):
        c, _, calls = self.fixture(); p=Path(c.receipt_path); p.write_text('earlier-evidence')
        with self.assertRaises(FileExistsError): c.stop_apply(event(),h.checkpoint(c.reader,c.bound,c.armed_at))
        self.assertEqual(p.read_text(),'earlier-evidence'); self.assertFalse(any(m != "GET" for _,m in calls))
        c, _, calls = self.fixture(); api = c.api
        def ambiguous(path,method="GET"):
            result=api(path,method)
            if method != "GET": raise RuntimeError("private-response")
            return result
        c.api=ambiguous
        with self.assertRaises(RuntimeError): c.stop_apply(event(),h.checkpoint(c.reader,c.bound,c.armed_at))
        self.assertEqual(json.loads(Path(c.receipt_path).read_text())["phase"],"stop-intent")
        with self.assertRaises(RuntimeError): c.stop_apply(event(),h.checkpoint(c.reader,c.bound,c.armed_at))
        self.assertEqual(sum(m != "GET" for _,m in calls),1)


if __name__ == "__main__": unittest.main()
