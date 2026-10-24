#!/usr/bin/env python3
"""Stop one explicitly approved Dev Apply only after a persisted partial checkpoint.

The private candidate file is produced by a separate read-only database observer.
This controller creates no jobs, writes no State and never clears a lock.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import time

from held_plan import private_file
from hosted_plan import Controller, Receipt, guid

ENDPOINT = "https://object.storage.eu01.onstackit.cloud"


def stamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", value):
        raise ValueError("UTC timestamp required")
    return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


def digest(raw): return hashlib.sha256(raw).hexdigest()


def binding_file(path, instance, space, template):
    b = json.loads(private_file(path).read_text())
    if set(b) != {"version", "instanceId", "tenantId", "planId", "runnerSpace", "runnerTemplate", "sourceDropletId", "backendSha256", "backend", "creates"}:
        raise ValueError("Exact reviewed binding required")
    for key in ["instanceId", "tenantId", "planId", "runnerSpace", "runnerTemplate", "sourceDropletId"]: guid(b[key])
    if (b["version"] != 1 or b["instanceId"] != instance or b["runnerSpace"] != space or b["runnerTemplate"] != template
            or not re.fullmatch(r"[a-f0-9]{64}", b["backendSha256"])
            or type(b["creates"]) is not int or not 2 <= b["creates"] <= 1000):
        raise ValueError("Reviewed initial-Apply binding mismatch")
    backend = b["backend"]
    if (set(backend) != {"bucket", "key", "endpoint", "region", "useLockfile"}
            or backend["endpoint"] != ENDPOINT or backend["region"] != "eu01" or backend["useLockfile"] is not True
            or backend["key"] != f"applications/{b['tenantId']}/{instance}/terraform.tfstate"
            or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", backend["bucket"])):
        raise ValueError("Exact STACKIT Application S3 namespace required")
    return b


def candidate(value, bound, armed_at, now):
    try:
        if set(value) != {"event", "instanceId", "planId", "jobId", "appId", "sourceDropletId", "backendSha256", "jobCreatedAt", "observedAt", "status"}: return None
        for key in ["instanceId", "planId", "jobId", "appId", "sourceDropletId"]: guid(value[key])
        observed, created = stamp(value["observedAt"]), stamp(value["jobCreatedAt"])
        if (value["event"] != "application_apply_candidate" or value["status"] != "applying"
                or any(value[key] != bound[key] for key in ["instanceId", "planId", "sourceDropletId", "backendSha256"])
                or created < armed_at or created > observed or observed < armed_at or observed > now + 1 or now - observed > 3): return None
        return value
    except (ValueError, TypeError, KeyError): return None


class S3Reader:
    def __init__(self, profile, bound):
        # Explicit operator profile only; no credentials enter the binding/receipt.
        import boto3
        from botocore.config import Config
        self.client = boto3.Session(profile_name=profile).client("s3", endpoint_url=ENDPOINT, region_name="eu01",
            config=Config(connect_timeout=3, read_timeout=5, retries={"total_max_attempts": 1}))
        self.bucket = bound["backend"]["bucket"]

    def read(self, key):
        from botocore.exceptions import ClientError
        try:
            r = self.client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404: return None
            raise RuntimeError("Exact S3 read failed; private response omitted") from None
        limit = 65536 if key.endswith(".tflock") else 16 * 1024 * 1024
        try: raw = r["Body"].read(limit + 1)
        finally: r["Body"].close()
        identity = r.get("VersionId") or r.get("ETag")
        if len(raw) > limit or not isinstance(identity, str) or not 1 <= len(identity) <= 1024:
            raise ValueError("Bounded, identified State observation required")
        return raw, identity


def checkpoint(reader, bound, armed_at):
    key = bound["backend"]["key"]
    a, lock = reader.read(key), reader.read(key + ".tflock")
    b, lock_again = reader.read(key), reader.read(key + ".tflock")
    if a is None or lock is None or a != b or lock != lock_again: return None
    state, info = json.loads(a[0]), json.loads(lock[0])
    if (state.get("version") != 4 or type(state.get("serial")) is not int or state["serial"] < 0
            or info.get("Operation") != "OperationTypeApply" or info.get("Version") != "1.12.6"
            or info.get("Path") != bound["backend"]["bucket"] + "/" + key
            or not armed_at <= stamp(info.get("Created")) <= time.time() + 1): return None
    guid(info["ID"])
    resources = state.get("resources")
    if not isinstance(resources, list): return None
    contracts, managed, cloud, projects = [], 0, 0, 0
    for resource in resources:
        instances = resource.get("instances", [])
        if not isinstance(instances, list) or any(i.get("deposed") or i.get("status") == "tainted" for i in instances): return None
        if resource.get("mode") != "managed": continue
        managed += len(instances)
        kind = resource.get("type", "")
        if kind.startswith("stackit_"):
            cloud += len(instances)
            if any(not isinstance(i.get("attributes", {}).get("id"), str) or not i["attributes"]["id"] for i in instances): return None
            if kind == "stackit_resourcemanager_project": projects += len(instances)
        if not resource.get("module") and kind == "terraform_data" and resource.get("name") == "contract": contracts += instances
    if len(contracts) != 1: return None
    instance = contracts[0].get("attributes", {}).get("input")
    if isinstance(instance, dict): instance = instance.get("value")
    if instance != bound["instanceId"] or projects != 1 or not 0 < cloud or not 1 < managed < bound["creates"]: return None
    return {"stateSha256": digest(a[0]), "stateSerial": state["serial"], "stateVersion": a[1],
            "lockSha256": digest(lock[0]), "lockVersion": lock[1], "lockId": info["ID"],
            "managedResources": managed, "cloudResources": cloud}


class ApplyController(Controller):
    def __init__(self, *args, bound, snapshot, reader, **kwargs):
        super().__init__(*args, **kwargs)
        self.bound, self.snapshot_path, self.reader = bound, snapshot, reader

    def snapshot(self):
        try: raw = private_file(self.snapshot_path).read_bytes()
        except FileNotFoundError: return None
        if len(raw) > 16384: raise ValueError("Bounded candidate required")
        return candidate(json.loads(raw), self.bound, self.armed_at, time.time())

    def exact_active_runner(self, event):
        app_id = event["appId"]
        app = self.api("/v3/apps/" + app_id)
        if (app_id == self.template or app.get("guid") != app_id
                or app.get("relationships", {}).get("space", {}).get("data", {}).get("guid") != self.space):
            raise RuntimeError("Exact active Dev Runner required")
        warm = app.get("name", "").startswith("lzc-warm-")
        if warm:
            guid(app["name"][len("lzc-warm-"):])
            if app.get("state") != "STARTED": raise RuntimeError("Live warm app required")
        elif app.get("name") != "lzc-plan-" + event["jobId"]: raise RuntimeError("Runner job identity mismatch")
        routes = self.api(f"/v3/apps/{app_id}/routes")
        if routes["resources"] or routes["pagination"].get("next"): raise RuntimeError("Route-free Runner required")
        source = self.api("/v3/droplets/" + self.bound["sourceDropletId"])
        current = self.api(f"/v3/apps/{app_id}/droplets/current")
        guid(current["guid"])
        checksum = source.get("checksum", {})
        if (source.get("guid") != self.bound["sourceDropletId"] or source.get("state") != "STAGED"
                or source.get("relationships", {}).get("app", {}).get("data", {}).get("guid") != self.template
                or checksum.get("type") != "sha256" or not re.fullmatch(r"[a-f0-9]{64}", checksum.get("value", ""))
                or current.get("state") != "STAGED" or current.get("guid") == source["guid"]
                or current.get("checksum") != checksum or current.get("relationships", {}).get("app", {}).get("data", {}).get("guid") != app_id):
            raise RuntimeError("Exact immutable Runner copy required")
        tasks = self.api(f"/v3/apps/{app_id}/tasks?per_page=100")
        if tasks["pagination"].get("next"): raise RuntimeError("Complete task inspection required")
        active = [t for t in tasks["resources"] if t["state"] not in {"SUCCEEDED", "FAILED"}]
        if not warm:
            if len(active) != 1 or active[0]["state"] != "RUNNING" or active[0]["name"] != "initial-plan":
                raise RuntimeError("Exact active one-shot task required")
            return f"/v3/tasks/{guid(active[0]['guid'])}/actions/cancel"
        stats = self.api(f"/v3/apps/{app_id}/processes/web/stats")["resources"]
        if active or len(stats) != 1 or stats[0].get("state") != "RUNNING": raise RuntimeError("Exact single live warm process required")
        return f"/v3/apps/{app_id}/actions/stop"

    def stop_apply(self, event, observed):
        if not self.confirm or self.stopped or not self.boundary_verified: raise RuntimeError("No single-use stop authorization")
        path = self.exact_active_runner(event)
        latest = self.snapshot()
        if not latest or any(latest[k] != event[k] for k in ["jobId", "appId", "sourceDropletId"]) or checkpoint(self.reader, self.bound, self.armed_at) != observed:
            raise RuntimeError("Apply/checkpoint changed before stop")
        latest = self.snapshot()
        if not latest or latest["jobId"] != event["jobId"] or latest["appId"] != event["appId"]: raise RuntimeError("Fresh Apply observation required")
        self.stopped = True
        with Receipt(self.receipt_path) as receipt:
            record = {"phase": "stop-intent", "instanceId": self.instance, "planId": self.bound["planId"], "jobId": event["jobId"],
                "app": event["appId"], "sourceDropletId": self.bound["sourceDropletId"], "backendSha256": self.bound["backendSha256"],
                "observedAt": latest["observedAt"], "intentAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "checkpoint": observed, "qualifiesRecovery": False}
            receipt.write(record)
            final = self.snapshot()
            if not final or final["jobId"] != event["jobId"] or final["appId"] != event["appId"]:
                raise RuntimeError("Apply observation expired or changed after intent")
            self.api(path, "POST")
            receipt.write({**record, "phase": "stop-requested", "responseAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})

    def observe(self, seconds):
        self.boundary()
        source = self.api(f"/v3/apps/{self.template}/droplets/current")
        if source.get("guid") != self.bound["sourceDropletId"] or source.get("state") != "STAGED": raise RuntimeError("Deployed source changed")
        key = self.bound["backend"]["key"]
        if self.reader.read(key) is not None or self.reader.read(key + ".tflock") is not None:
            raise RuntimeError("This initial-Apply drill requires an empty, unlocked disposable backend")
        self.armed_at = time.time()
        deadline = time.monotonic() + seconds
        print(json.dumps({"event": "apply-observer-ready", "mode": "stop-once" if self.confirm else "observe-only", "qualifiesRecovery": False}), flush=True)
        while time.monotonic() < deadline:
            event = self.snapshot()
            if event:
                observed = checkpoint(self.reader, self.bound, self.armed_at)
                if observed:
                    if not self.confirm:
                        print(json.dumps({"event": "partial-apply-checkpoint-observed", "qualifiesRecovery": False}), flush=True)
                        return
                    self.stop_apply(event, observed)
                    print(json.dumps({"event": "apply-stop-requested", "qualifiesRecovery": False}), flush=True)
                    return
            time.sleep(.2)
        raise RuntimeError("No eligible partial Apply checkpoint; no interruption qualified")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ["cf", "cf-home", "binding", "snapshot", "s3-profile"]: p.add_argument("--" + name, required=True)
    for name in ["runner-space", "runner-template", "instance"]: p.add_argument("--" + name, required=True, type=guid)
    p.add_argument("--confirm-disposable-stop", type=guid)
    p.add_argument("--receipt")
    p.add_argument("--seconds", type=int, choices=range(1, 901), default=900, metavar="1..900")
    args = p.parse_args()
    os.umask(0o077)
    b = binding_file(args.binding, args.instance, args.runner_space, args.runner_template)
    ApplyController(args.cf, args.cf_home, args.runner_space, args.runner_template, args.instance,
        args.confirm_disposable_stop, args.receipt, bound=b, snapshot=args.snapshot, reader=S3Reader(args.s3_profile, b)).observe(args.seconds)


if __name__ == "__main__":
    try: main()
    except Exception as error:
        print(json.dumps({"event": "apply-observer-failed", "type": type(error).__name__, "qualifiesRecovery": False}), file=__import__("sys").stderr)
        raise SystemExit(1)
