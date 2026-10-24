#!/usr/bin/env python3
"""Operator-only preparation of one expiring native Plan hold in isolated Dev.

No customer job creation, Apply, State access or recovery clearance.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
import re
from pathlib import Path
import secrets
import shlex
import subprocess
import tempfile
import time
import uuid

from hosted_plan import API, Controller, guid
ORIGIN = "https://lzc-dev-configurator.apps.01.cf.eu01.stackit.cloud"


def private_file(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_uid != os.getuid() or path.stat().st_mode & 0o077:
        raise ValueError("Owned private file required")
    return path


class Client:
    def __init__(self, cf, home):
        home = Path(home)
        if home.is_symlink() or not home.is_dir() or home.stat().st_uid != os.getuid() or home.stat().st_mode & 0o077:
            raise ValueError("Owned private CF_HOME required")
        if (home / ".cf").is_symlink(): raise ValueError("Symlinked CF configuration directory")
        config = json.loads(private_file(home / ".cf" / "config.json").read_text())
        if config.get("Target") != API:
            raise ValueError("Unexpected CF foundation")
        self.cf = str(Path(cf).resolve(strict=True))
        self.env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "CF_HOME": str(home.resolve())}
        self.space = guid(config["SpaceFields"]["GUID"])

    def call(self, args, timeout=180):
        result = subprocess.run([self.cf, *args], env=self.env, capture_output=True, timeout=timeout)
        if result.returncode:
            raise RuntimeError("Scoped CF operation failed; private response withheld")
        return result.stdout.decode()

    def api(self, path, method="GET", body=None):
        with tempfile.TemporaryDirectory(prefix="lzc-drill-request-") as folder:
            args = ["curl", path, "--fail"]
            if method != "GET":
                request = Path(folder) / "body.json"
                request.write_text(json.dumps({} if body is None else body))
                request.chmod(0o600)
                args += ["-X", method, "-d", "@" + str(request)]
            raw = self.call(args)
        return json.loads(raw) if raw.strip() else {}

    def boundary(self, organization, name):
        space = self.api("/v3/spaces/" + self.space)
        org = self.api("/v3/organizations/" + guid(space["relationships"]["organization"]["data"]["guid"]))
        if space["name"] != name or org["name"] != organization:
            raise ValueError("Unexpected Dev organization/space")


class OperatorTask:
    def __init__(self, client, app, variables):
        self.client, self.source, self.variables = client, app, variables
        self.id = None
        self.name = "lzc-recovery-drill-operator-" + uuid.uuid4().hex[:12]

    def __enter__(self):
        try:
            droplet = self.client.api(f"/v3/apps/{self.source}/droplets/current")
            if droplet["state"] != "STAGED": raise RuntimeError("API source not staged")
            created = self.client.api("/v3/apps", "POST", {
                "name": self.name,
                "lifecycle": {"type": "buildpack", "data": {"buildpacks": ["binary_buildpack"], "stack": "cflinuxfs4"}},
                "relationships": {"space": {"data": {"guid": self.client.space}}},
                "environment_variables": self.variables,
            })
            self.id = guid(created["guid"])
            copy = self.client.api("/v3/droplets?source_guid=" + guid(droplet["guid"]), "POST", {"relationships": {"app": {"data": {"guid": self.id}}}})
            copied = guid(copy["guid"])
            for _ in range(90):
                state = self.client.api("/v3/droplets/" + copied)["state"]
                if state == "STAGED": break
                if state != "COPYING": raise RuntimeError("Operator droplet copy failed")
                time.sleep(1)
            else: raise RuntimeError("Operator droplet copy timed out")
            self.client.api(f"/v3/apps/{self.id}/relationships/current_droplet", "PATCH", {"data": {"guid": copied}})
            return self
        except BaseException:
            self.close()
            raise

    def close(self):
        if self.id:
            self.client.api("/v3/apps/" + self.id, "DELETE")
            self.id = None

    def __exit__(self, *args): self.close()

    def query(self, sql, values, wait_ready=False):
        query = "await c.query(" + json.dumps(sql) + "," + json.dumps(values) + ")"
        polling = "for(let i=0;i<120&&r.rows[0]?.status==='warming';i++){await new Promise(done=>setTimeout(done,1000));r=" + query + ";}" if wait_ready else ""
        script = 'import pg from "pg";import {databaseConfig} from "./apps/api/dist/storage/database.js";const c=new pg.Client(databaseConfig());await c.connect();try{let r=' + query + ';' + polling + 'console.log("DRILL_QUERY="+JSON.stringify(r.rows));}finally{await c.end();}'
        task = "q-" + uuid.uuid4().hex[:12]
        command = "./runtime/bin/node --input-type=module -e " + shlex.quote(script)
        self.client.call(["run-task", self.name, "--command", command, "--name", task, "-m", "128M", "-k", "6144M", "--wait"])
        # Poll only logs: the SQL task, including lease acquisition, must never be replayed.
        for _ in range(10):
            logs = self.client.call(["logs", self.name, "--recent"])
            hits = []
            for line in logs.splitlines():
                if f"[APP/TASK/{task}/" in line and "DRILL_QUERY=" in line:
                    hits.append(json.loads(line.split("DRILL_QUERY=", 1)[1]))
            if len(hits) == 1: return hits[0]
            if len(hits) > 1: break
            time.sleep(1)
        raise RuntimeError("Exact operator task receipt unavailable")


def verified_clone(deployed, current, app_id, source):
    if current.get("guid") != source or current.get("state") != "STAGED":
        raise RuntimeError("Runner source changed during arming")
    checksum = current.get("checksum")
    if (not isinstance(checksum, dict) or checksum.get("type") != "sha256"
            or not isinstance(checksum.get("value"), str) or not re.fullmatch(r"[a-f0-9]{64}", checksum["value"])):
        raise RuntimeError("Exact source checksum unavailable")
    # CAPI copies have their own GUID; the immutable payload and owning app must match.
    cloned = guid(deployed.get("guid"))
    if (cloned == source or deployed.get("state") != "STAGED" or deployed.get("checksum") != checksum
            or deployed.get("relationships", {}).get("app", {}).get("data", {}).get("guid") != app_id):
        raise RuntimeError("Warm app clone source mismatch")
    return cloned, checksum


def arm(runner, manager, task, instance, space, template, source, record):
    ticket = secrets.token_urlsafe(32)
    record({"phase": "lease-intent", "instanceId": instance, "sourceDropletId": source, "qualifiesRecovery": False})
    rows = task.query(Path(__file__).with_name("hold_lease.sql").read_text(), [space, ORIGIN, source, hashlib.sha256(ticket.encode()).hexdigest()])
    if len(rows) != 1: raise RuntimeError("No fresh unassigned source-bound standby; no Runner stopped")
    slot = rows[0]
    slot_id, app_id = guid(slot["id"]), guid(slot["app_id"])
    record({"phase": "lease-rewarming", "instanceId": instance, "slotId": slot_id, "appId": app_id, "sourceDropletId": source, "qualifiesRecovery": False})
    app = runner.api("/v3/apps/" + app_id)
    if app_id == template or app.get("name") != "lzc-warm-" + slot_id or app["relationships"]["space"]["data"]["guid"] != space:
        raise RuntimeError("Exact unassigned warm app not established; lease will expire")
    if runner.api(f"/v3/apps/{app_id}/routes")["resources"]:
        raise RuntimeError("Routed app cannot be used for a drill")
    deployed = runner.api(f"/v3/apps/{app_id}/droplets/current")
    current = runner.api(f"/v3/apps/{template}/droplets/current")
    cloned, checksum = verified_clone(deployed, current, app_id, source)
    record({"phase": "clone-verified", "appId": app_id, "sourceDropletId": source,
            "clonedDropletId": cloned, "checksumSha256": checksum["value"], "qualifiesRecovery": False})
    record({"phase": "stop-unassigned-intent", "appId": app_id, "qualifiesRecovery": False})
    runner.api(f"/v3/apps/{app_id}/actions/stop", "POST")
    expires = (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    config = {"version": 1, "instanceId": instance, "appId": app_id, "spaceId": space, "expiresAt": expires}
    record({"phase": "configure-hold-intent", "appId": app_id, "qualifiesRecovery": False})
    runner.api(f"/v3/apps/{app_id}/environment_variables", "PATCH", {"var": {"LZC_POOL_TICKET": ticket, "LZC_RECOVERY_PLAN_HOLD": json.dumps(config, separators=(",", ":"))}})
    record({"phase": "start-prepared-intent", "appId": app_id, "qualifiesRecovery": False})
    runner.api(f"/v3/apps/{app_id}/actions/start", "POST")
    ready = task.query("SELECT status,app_id,source_droplet_id,last_seen_at>now()-interval '10 seconds' AS fresh FROM lzc.runner_pool_slots WHERE id=$1", [slot_id], wait_ready=True)
    if len(ready) != 1 or ready[0]["status"] != "ready" or not ready[0]["fresh"] or ready[0]["app_id"] != app_id or ready[0]["source_droplet_id"] != source:
        raise RuntimeError("Broker readiness not established; no Plan may be started")
    record({"phase": "ready", **config, "slotId": slot_id, "sourceDropletId": source, "clonedDropletId": cloned, "checksumSha256": checksum["value"], "qualifiesRecovery": False})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ["cf", "cf-home", "app-cf-home", "migration-vars", "receipt"]: p.add_argument("--" + name, required=True)
    for name in ["runner-space", "runner-template", "instance", "confirm-disposable-hold"]: p.add_argument("--" + name, required=True, type=guid)
    args = p.parse_args()
    os.umask(0o077)
    try:
        if args.instance != args.confirm_disposable_hold: raise ValueError("Exact disposable-instance confirmation required")
        # Reuse the stop controller's private login and fixed Runner boundary checks.
        guard = Controller(args.cf, args.cf_home, args.runner_space, args.runner_template, args.instance)
        guard.boundary()
        runner, manager = Client(args.cf, args.cf_home), Client(args.cf, args.app_cf_home)
        if runner.space != args.runner_space: raise ValueError("Runner space mismatch")
        manager.boundary("lzc-dev", "configurator")
        found = manager.api(f"/v3/apps?space_guids={manager.space}&names=landing-zone-configurator")["resources"]
        if len(found) != 1: raise ValueError("Exact Dev API app unavailable")
        app = guid(found[0]["guid"])
        runtime = manager.api(f"/v3/apps/{app}/environment_variables")["var"]
        if runtime.get("LZC_RUNNER_POOL_SIZE") != "1" or runtime.get("LZC_RUNNER_SPACE_ID") != args.runner_space or runtime.get("LZC_RUNNER_TEMPLATE_ID") != args.runner_template:
            raise ValueError("Expected single-standby Dev runtime not established")
        source = guid(runtime["LZC_RUNNER_DROPLET_ID"])
        variables = json.loads(private_file(args.migration_vars).read_text())
        keys = {"LZC_DATABASE_HOST", "LZC_DATABASE_PORT", "LZC_DATABASE_NAME", "LZC_DATABASE_USER", "LZC_DATABASE_PASSWORD"}
        if set(variables) != keys or variables.get("LZC_DATABASE_USER") != "configurator_migration" or variables.get("LZC_DATABASE_NAME") != "configurator":
            raise ValueError("Isolated migration identity required")
        for key in ["LZC_DATABASE_HOST", "LZC_DATABASE_PORT", "LZC_DATABASE_NAME"]:
            if variables[key] != runtime[key]: raise ValueError("Dev database target mismatch")
        # Capability preflight has no job ticket, native process or State access.
        code = 'import {devPlanHoldMilliseconds} from "./apps/worker/dist/recovery-hold.js";if(devPlanHoldMilliseconds!==30000)throw Error("hold-capability-mismatch");'
        runner.call(["run-task", "lzc-plan-template", "--command", "./runtime/bin/node --input-type=module -e " + shlex.quote(code), "--name", "hold-capability-" + uuid.uuid4().hex[:8], "-m", "128M", "-k", "4096M", "--wait"])
        from hosted_plan import Receipt
        with Receipt(args.receipt) as receipt, OperatorTask(manager, app, variables) as task:
            arm(runner, manager, task, args.instance, args.runner_space, args.runner_template, source, receipt.write)
        print(json.dumps({"event": "held-plan-runner-ready", "qualifiesRecovery": False}), flush=True)
    except (ValueError, RuntimeError, KeyError, OSError, subprocess.SubprocessError):
        print(json.dumps({"event": "hold-arming-inconclusive", "qualifiesRecovery": False}), flush=True)
        raise SystemExit(1)


if __name__ == "__main__": main()
