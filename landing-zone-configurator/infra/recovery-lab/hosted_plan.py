#!/usr/bin/env python3
"""Observe one disposable Dev Application Plan; optionally stop its exact Runner.

No job creation, credentials export, State access, unlocking or recovery approval.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import selectors
import subprocess
import time
import uuid

API = "https://api.system.01.cf.eu01.stackit.cloud"
MARKER = '{"event":"application_plan_observation"'


def guid(value):
    if not isinstance(value, str):
        raise ValueError("A canonical full UUID is required")
    if str(uuid.UUID(value)) != value:
        raise ValueError("A canonical full UUID is required")
    return value


def observation(line, instance, armed_at, now):
    offset = line.find(MARKER)
    if offset < 0:
        return None
    try:
        event = json.loads(line[offset:])
        if set(event) != {"event", "jobId", "instanceId", "observation", "observedAt"}:
            return None
        guid(event["jobId"])
        if event["instanceId"] != instance or event["event"] != "application_plan_observation":
            return None
        if event["observation"] not in {"native-plan-observed", "plan-command-finished"}:
            return None
        if not isinstance(event["observedAt"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z", event["observedAt"]):
            return None
        stamp = datetime.fromisoformat(event["observedAt"].replace("Z", "+00:00")).timestamp()
        if not armed_at <= stamp <= now + 1 or now - stamp > 3:
            return None
        return event
    except (ValueError, TypeError, KeyError):
        return None


class Controller:
    def __init__(self, cf, cf_home, space, template, instance, confirm=None, receipt=None):
        self.cf = str(Path(cf).resolve(strict=True))
        self.space, self.template, self.instance = map(guid, (space, template, instance))
        if confirm is not None and confirm != instance:
            raise ValueError("Stop confirmation must exactly match the disposable instance UUID")
        if confirm and not receipt:
            raise ValueError("Stop mode requires a new private receipt path")
        self.receipt_path = receipt
        home = Path(cf_home)
        if home.is_symlink() or not home.is_dir() or home.stat().st_uid != os.getuid() or home.stat().st_mode & 0o077:
            raise ValueError("CF_HOME must be an owned private directory, not a symlink")
        config_path = home / ".cf" / "config.json"
        if config_path.parent.is_symlink() or config_path.is_symlink() or not config_path.is_file() or config_path.stat().st_uid != os.getuid() or config_path.stat().st_mode & 0o077:
            raise ValueError("CF configuration must be owned, private and not a symlink")
        config = json.loads(config_path.read_text())
        if config.get("Target") != API or config.get("SpaceFields", {}).get("GUID") != space:
            raise ValueError("CF target does not match the selected Dev Runner space")
        self.env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "CF_HOME": str(home.resolve())}
        self.confirm = confirm
        self.stopped = False
        self.boundary_verified = False

    def call(self, args):
        result = subprocess.run([self.cf, *args], env=self.env, capture_output=True, timeout=15)
        if result.returncode:
            raise RuntimeError("CF operation failed; private response omitted")
        return result.stdout.decode()

    def api(self, path, method="GET"):
        args = ["curl", path, "--fail"]
        if method != "GET":
            args += ["-X", method, "-d", "{}"]
        body = self.call(args).strip()
        value = json.loads(body) if body else {}
        if isinstance(value, dict) and value.get("errors"):
            raise RuntimeError("CF API rejected operation; private response omitted")
        return value

    def boundary(self):
        self.boundary_verified = False
        space = self.api(f"/v3/spaces/{self.space}")
        org = self.api("/v3/organizations/" + guid(space["relationships"]["organization"]["data"]["guid"]))
        if org["name"] != "lzc-dev-runners" or space["name"] != "plans":
            raise RuntimeError("Only the isolated lzc-dev-runners/plans space is supported")
        template = self.api(f"/v3/apps/{self.template}")
        if template["name"] != "lzc-plan-template" or template["relationships"]["space"]["data"]["guid"] != self.space:
            raise RuntimeError("Runner template binding mismatch")
        self.boundary_verified = True

    def apps(self):
        result = self.api(f"/v3/apps?space_guids={self.space}&per_page=100")
        if result["pagination"].get("next"):
            raise RuntimeError("Complete Runner listing required")
        return {guid(app["guid"]): app for app in result["resources"] if re.fullmatch(r"lzc-(?:plan|warm)-[a-f0-9-]{36}", app["name"]) and app["guid"] != self.template}

    def stop(self, app_id, event, finished):
        guid(app_id)
        if not self.confirm or self.stopped or not self.boundary_verified or event["jobId"] in finished:
            raise RuntimeError("No stop authorization or observation is already finished")
        if observation(json.dumps(event, separators=(",", ":")), self.instance, self.armed_at, time.time()) is None or event["observation"] != "native-plan-observed":
            raise RuntimeError("Fresh matching native Plan observation required")
        app = self.api(f"/v3/apps/{app_id}")
        if app_id == self.template or app.get("guid") != app_id or app.get("relationships", {}).get("space", {}).get("data", {}).get("guid") != self.space:
            raise RuntimeError("Observed Runner is outside the allowed space")
        # Single-use guard is set before the first mutation, including API failure.
        self.stopped = True
        def fresh():
            if event["jobId"] in finished or observation(json.dumps(event, separators=(",", ":")), self.instance, self.armed_at, time.time()) is None:
                raise RuntimeError("Native Plan observation expired before mutation")
        def request(path, result):
            fresh()
            with Receipt(self.receipt_path) as receipt:
                record = {"phase": "stop-intent", "instanceId": self.instance, "jobId": event["jobId"], "observedAt": event["observedAt"], "intentAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), "qualifiesRecovery": False, **result}
                receipt.write(record)
                fresh()
                self.api(path, "POST")
                receipt.write({**record, "phase": "stop-requested", "responseAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
            return result
        if app["name"] == "lzc-plan-" + event["jobId"]:
            tasks = self.api(f"/v3/apps/{app_id}/tasks?per_page=100")
            active = [t for t in tasks["resources"] if t["state"] == "RUNNING"]
            if tasks["pagination"].get("next") or len(active) != 1 or active[0]["name"] != "initial-plan":
                raise RuntimeError("Exact active one-shot task was not established")
            task = guid(active[0]["guid"])
            return request(f"/v3/tasks/{task}/actions/cancel", {"action": "task-cancel-requested", "task": task, "app": app_id})
        if not app["name"].startswith("lzc-warm-") or app["state"] != "STARTED":
            raise RuntimeError("Exact active warm Runner was not established")
        return request(f"/v3/apps/{app_id}/actions/stop", {"action": "warm-runner-stop-requested", "app": app_id})

    def observe(self, seconds):
        self.boundary()
        self.armed_at = time.time()
        deadline = time.monotonic() + seconds
        selector = selectors.DefaultSelector()
        streams, finished = {}, set()
        next_listing = 0
        ready = False
        try:
            while time.monotonic() < deadline:
                if time.monotonic() >= next_listing:
                    for app_id, app in self.apps().items():
                        if app_id in streams:
                            continue
                        process = subprocess.Popen([self.cf, "logs", app["name"]], env=self.env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
                        streams[app_id] = (process, bytearray())
                        selector.register(process.stdout, selectors.EVENT_READ, app_id)
                    next_listing = time.monotonic() + 1
                    if not ready:
                        print(json.dumps({"event": "observer-ready", "mode": "stop-once" if self.confirm else "observe-only", "qualifiesRecovery": False}), flush=True)
                        ready = True
                candidates = []
                for key, _ in selector.select(timeout=0.2):
                    app_id = key.data
                    process, buffer = streams[app_id]
                    chunk = os.read(key.fileobj.fileno(), 65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    buffer.extend(chunk)
                    if len(buffer) > 262144:
                        raise RuntimeError("Bounded log observation exceeded")
                    while b"\n" in buffer:
                        line, _, remainder = buffer.partition(b"\n")
                        buffer[:] = remainder
                        event = observation(line.decode(errors="replace"), self.instance, self.armed_at, time.time())
                        if event:
                            if event["observation"] == "plan-command-finished":
                                finished.add(event["jobId"])
                            else:
                                candidates.append((app_id, event))
                if len({(a, e["jobId"]) for a, e in candidates}) > 1:
                    raise RuntimeError("Ambiguous concurrent target observations")
                for app_id, event in candidates:
                    if event["jobId"] in finished:
                        print(json.dumps({"event": "window-missed", "qualifiesRecovery": False}), flush=True)
                        continue
                    if not self.confirm:
                        print(json.dumps({"event": "matching-native-plan-observed", "qualifiesRecovery": False}), flush=True)
                        continue
                    result = self.stop(app_id, event, finished)
                    # A requested stop alone proves neither process exit nor safe recovery.
                    print(json.dumps({"event": "stop-requested", "action": result["action"], "qualifiesRecovery": False}), flush=True)
                    return
            raise RuntimeError("Observation window expired; no interruption qualified")
        finally:
            for process, _ in streams.values():
                process.terminate()
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            selector.close()


class Receipt:
    """Persist an intent before a possibly ambiguous CF request; never overwrite."""
    def __init__(self, path):
        path = Path(path)
        parent = path.parent
        if parent.resolve() != parent.absolute() or parent.stat().st_uid != os.getuid() or parent.stat().st_mode & 0o077:
            raise ValueError("Receipt parent must be an owned private directory without symlinks")
        self.parent = parent
        self.fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)

    def __enter__(self): return self

    def write(self, value):
        data = (json.dumps(value) + "\n").encode()
        os.lseek(self.fd, 0, os.SEEK_SET)
        os.ftruncate(self.fd, 0)
        while data:
            data = data[os.write(self.fd, data):]
        os.fsync(self.fd)
        directory = os.open(self.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)

    def __exit__(self, *_): os.close(self.fd)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cf", required=True)
    parser.add_argument("--cf-home", required=True)
    parser.add_argument("--runner-space", required=True, type=guid)
    parser.add_argument("--runner-template", required=True, type=guid)
    parser.add_argument("--instance", required=True, type=guid)
    parser.add_argument("--confirm-disposable-stop", type=guid)
    parser.add_argument("--receipt", help="New file in an owned private directory; required for stop mode")
    parser.add_argument("--seconds", type=int, default=300, choices=range(10, 901))
    args = parser.parse_args()
    try:
        Controller(args.cf, args.cf_home, args.runner_space, args.runner_template, args.instance, args.confirm_disposable_stop, args.receipt).observe(args.seconds)
    except (RuntimeError, ValueError, KeyError, OSError, subprocess.SubprocessError):
        print(json.dumps({"event": "observer-inconclusive", "qualifiesRecovery": False}), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
