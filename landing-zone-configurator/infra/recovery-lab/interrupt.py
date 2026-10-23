#!/usr/bin/env python3
"""Deterministic hard-stop tests of real OpenTofu using synthetic local fixtures."""
import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.12.6"


class CheckpointIncomplete(RuntimeError):
    pass


class Engine:
    def __init__(self, binary, root):
        self.binary = str(binary)
        self.root = root
        self.env = {"PATH": os.defpath, "HOME": str(root), "CHECKPOINT_DISABLE": "1",
                    "TF_IN_AUTOMATION": "1", "TF_INPUT": "0",
                    "TF_CLI_CONFIG_FILE": str(root / "fixture.tfrc")}
        (root / "fixture.tfrc").write_text("disable_checkpoint = true\n")

    def start(self, *args):
        log = open(self.root / "engine.log", "ab")
        try:
            child = subprocess.Popen([self.binary, *args], cwd=self.root,
                                     env=self.env, stdin=subprocess.DEVNULL,
                                     stdout=log, stderr=log, start_new_session=True)
        finally:
            log.close()
        return child

    def run(self, *args):
        child = self.start(*args)
        try:
            if child.wait(timeout=60) != 0:
                raise RuntimeError("synthetic engine command failed")
        finally:
            stop(child)

    def changes(self, plan):
        result = subprocess.run([self.binary, "show", "-json", plan], cwd=self.root,
                                env=self.env, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=30, check=True)
        return {r["address"]: r["change"]["actions"]
                for r in json.loads(result.stdout).get("resource_changes", [])}


def stop(child):
    if child.poll() is None:
        # Only a session created by this controller; never match arbitrary process names.
        os.killpg(child.pid, signal.SIGKILL)
        child.wait(timeout=10)


@contextmanager
def state_barrier():
    entered = threading.Event()
    released = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path != "/state":
                self.send_error(404)
                return
            entered.set()
            if not released.wait(timeout=30):
                self.send_error(503)
                return
            data = json.dumps({"version": 4, "terraform_version": VERSION,
                               "serial": 1, "lineage": "11111111-1111-4111-8111-111111111111",
                               "outputs": {"marker": {"value": "synthetic-only", "type": "string"}},
                               "resources": []}).encode()
            try:
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port, entered, released
    finally:
        released.set()
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def plan_test(binary, root):
    root.mkdir(mode=0o700)
    engine = Engine(binary, root)
    with state_barrier() as (port, entered, released):
        (root / "main.tf").write_text('''data "terraform_remote_state" "barrier" {
  backend = "http"
  config = { address = "http://127.0.0.1:PORT/state" }
}
resource "terraform_data" "probe" {
  input = data.terraform_remote_state.barrier.outputs.marker
}
'''.replace("PORT", str(port)))
        engine.run("init", "-no-color")
        child = engine.start("plan", "-no-color", "-out=interrupted.bin")
        try:
            if not entered.wait(timeout=20) or child.poll() is not None:
                raise RuntimeError("running Plan barrier not established")
            stop(child)
            if child.returncode != -signal.SIGKILL or (root / "interrupted.bin").exists():
                raise RuntimeError("interrupted Plan produced an eligible saved plan")
            state = root / "terraform.tfstate"
            if state.exists() and state.stat().st_size and json.loads(state.read_text()).get("resources"):
                raise RuntimeError("Plan unexpectedly created resources")
            released.set()
            engine.run("plan", "-no-color", "-out=recovered.bin")
            if engine.changes("recovered.bin").get("terraform_data.probe") != ["create"]:
                raise RuntimeError("fresh Plan after hard stop inconsistent")
        finally:
            stop(child)
    print(json.dumps({"event": "synthetic-plan-interruption", "result": "passed",
                      "barrier": "real-plan-state-read", "eligibleInterruptedPlan": False,
                      "freshPlan": "passed", "cloudOperations": 0}))


def apply_test(binary, root, first_apply=False):
    root.mkdir(mode=0o700)
    engine = Engine(binary, root)
    (root / "barrier.py").write_text('''from pathlib import Path
import time
Path("apply-entered").write_text("synthetic-only")
while not Path("release-apply").exists():
    time.sleep(0.05)
''')
    # Establish a persisted baseline independently of the first-Apply diagnostic.
    baseline = 'resource "terraform_data" "baseline" { input = "synthetic-baseline" }\n'
    if not first_apply:
        (root / "main.tf").write_text(baseline)
        engine.run("init", "-no-color")
        engine.run("plan", "-no-color", "-out=baseline.bin")
        engine.run("apply", "-no-color", "baseline.bin")
    # No provider downloads, credentials, remote backend or customer modules.
    (root / "main.tf").write_text(("" if first_apply else baseline) + '''resource "terraform_data" "retained" {
  input = "synthetic-only"
}
resource "terraform_data" "checkpoint_gate" {
  depends_on = [terraform_data.retained]
  provisioner "local-exec" {
    command = "PYTHON -c 'import time; time.sleep(21)'"
  }
}
resource "terraform_data" "barrier" {
  depends_on = [terraform_data.checkpoint_gate]
  provisioner "local-exec" {
    command = "PYTHON barrier.py"
  }
}
'''.replace("PYTHON", sys.executable))
    engine.run("init", "-no-color")
    engine.run("plan", "-no-color", "-out=approved.bin")
    child = engine.start("apply", "-no-color", "approved.bin")
    try:
        deadline = time.monotonic() + 60
        checkpoint = None
        while time.monotonic() < deadline and child.poll() is None:
            state = root / "terraform.tfstate"
            if (root / "apply-entered").exists() and state.exists():
                try:
                    checkpoint = json.loads(state.read_text())
                    retained = next((r for r in checkpoint.get("resources", []) if r["name"] == "retained"), None)
                    if retained and retained.get("instances"):
                        break
                    if any(r["name"] == "checkpoint_gate" for r in checkpoint.get("resources", [])):
                        raise CheckpointIncomplete("checkpoint omitted completed synthetic resource")
                except (json.JSONDecodeError, OSError):
                    pass
            time.sleep(0.02)
        else:
            raise RuntimeError("partial Apply checkpoint/barrier not established")
        identity = retained["instances"][0]["attributes"]["id"]
        stop(child)
        if child.returncode != -signal.SIGKILL:
            raise RuntimeError("Apply was not hard-stopped")
        (root / "release-apply").write_text("synthetic-only")
        engine.run("plan", "-no-color", "-out=recovery.bin")
        if engine.changes("recovery.bin").get("terraform_data.retained") != ["no-op"]:
            raise RuntimeError("recovery would replace retained resource")
        engine.run("apply", "-no-color", "recovery.bin")
        final = json.loads((root / "terraform.tfstate").read_text())
        retained_after = next(r for r in final["resources"] if r["name"] == "retained")
        if retained_after["instances"][0]["attributes"]["id"] != identity:
            raise RuntimeError("retained resource identity changed")
    finally:
        stop(child)
    print(json.dumps({"event": "synthetic-apply-interruption", "result": "passed",
                      "initialState": "empty" if first_apply else "existing-baseline",
                      "checkpoint": "retained", "freshPlanAndApply": "passed",
                      "retainedResourceReplaced": False, "cloudOperations": 0}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tofu", required=True, type=Path)
    parser.add_argument("--first-apply-diagnostic", action="store_true",
                        help="Probe the known initially empty local-State gap (#140); failure is not a passing acceptance")
    args = parser.parse_args()
    binary = args.tofu.resolve(strict=True)
    if not args.tofu.is_absolute() or not binary.is_file():
        raise RuntimeError("absolute OpenTofu binary required")
    version = subprocess.run([str(binary), "version", "-json"], env={"PATH": os.defpath,
                              "CHECKPOINT_DISABLE": "1"}, stdout=subprocess.PIPE,
                             stderr=subprocess.DEVNULL, timeout=10, check=True)
    if json.loads(version.stdout).get("terraform_version") != VERSION:
        raise RuntimeError("pinned OpenTofu required")
    with tempfile.TemporaryDirectory(prefix="lzc-synthetic-interruption-") as directory:
        root = Path(directory)
        if not args.first_apply_diagnostic:
            plan_test(binary, root / "plan")
        apply_test(binary, root / "apply", args.first_apply_diagnostic)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"event": "synthetic-interruption-failed", "type": type(error).__name__,
                          **({"code": "checkpoint-incomplete"} if isinstance(error, CheckpointIncomplete) else {})}), file=sys.stderr)
        sys.exit(1)
