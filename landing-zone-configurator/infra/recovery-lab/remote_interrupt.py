#!/usr/bin/env python3
"""Real OpenTofu against local HTTP/S3 protocol fixtures, never cloud endpoints."""
import argparse
from contextlib import contextmanager
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit

from interrupt import CheckpointIncomplete, Engine, VERSION, stop


@contextmanager
def backend_fixture(kind):
    objects = {}
    state_key = "/state" if kind == "http" else "/synthetic-state/terraform.tfstate"
    lock_key = "/lock" if kind == "http" else state_key + ".tflock"
    mutex = threading.Lock()
    conflicts = [0]

    class Handler(BaseHTTPRequestHandler):
        def respond(self, status, body=b"", etag=None, content_type="application/json"):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            if etag:
                self.send_header("ETag", '"' + etag + '"')
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def do_GET(self):
            address = urlsplit(self.path)
            if kind == "s3" and address.path == "/synthetic-state" and "list-type=2" in address.query:
                self.respond(200, b'<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>synthetic-state</Name><KeyCount>0</KeyCount><IsTruncated>false</IsTruncated></ListBucketResult>', content_type="application/xml")
                return
            with mutex:
                body = objects.get(address.path)
            if body is None:
                self.respond(404)
            else:
                self.respond(200, body, hashlib.md5(body).hexdigest())

        do_HEAD = do_GET

        def write(self):
            path = urlsplit(self.path).path
            if path not in (state_key, lock_key):
                self.respond(400)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            with mutex:
                if path == lock_key and (self.command == "LOCK" or self.headers.get("If-None-Match") == "*") and path in objects:
                    conflicts[0] += 1
                    self.respond(423 if kind == "http" else 412, objects[path])
                    return
                objects[path] = body
            self.respond(200, etag=hashlib.md5(body).hexdigest())

        do_POST = write
        do_PUT = write
        do_LOCK = write

        def remove(self):
            path = urlsplit(self.path).path
            if path != lock_key:
                self.respond(400)
                return
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            with mutex:
                if kind == "http" and path in objects and json.loads(body).get("ID") != json.loads(objects[path]).get("ID"):
                    self.respond(409)
                    return
                objects.pop(path, None)
            self.respond(200)

        do_DELETE = remove
        do_UNLOCK = remove

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port, objects, state_key, lock_key, mutex, conflicts
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def check(binary, kind):
    with tempfile.TemporaryDirectory(prefix=f"lzc-synthetic-{kind}-interruption-") as directory, backend_fixture(kind) as fixture:
        port, objects, state_key, lock_key, mutex, conflicts = fixture
        root = Path(directory)
        engine = Engine(binary, root)
        if kind == "http":
            backend = 'terraform {\n backend "http" {}\n}\n'
            engine.env.update(TF_HTTP_ADDRESS=f"http://127.0.0.1:{port}/state",
                              TF_HTTP_LOCK_ADDRESS=f"http://127.0.0.1:{port}/lock",
                              TF_HTTP_UNLOCK_ADDRESS=f"http://127.0.0.1:{port}/lock")
        else:
            backend = '''terraform {
  backend "s3" {
    bucket = "synthetic-state"
    key = "terraform.tfstate"
    region = "eu01"
    endpoints = { s3 = "http://127.0.0.1:PORT" }
    use_path_style = true
    use_lockfile = true
    skip_credentials_validation = true
    skip_region_validation = true
    skip_metadata_api_check = true
    skip_requesting_account_id = true
    skip_s3_checksum = true
  }
}
'''.replace("PORT", str(port))
            engine.env.update(AWS_ACCESS_KEY_ID="synthetic-only", AWS_SECRET_ACCESS_KEY="synthetic-only",
                              AWS_EC2_METADATA_DISABLED="true")
        (root / "main.tf").write_text(backend + '''resource "terraform_data" "retained" { input = "synthetic-only" }
resource "terraform_data" "checkpoint_gate" {
  depends_on = [terraform_data.retained]
  provisioner "local-exec" { command = "PYTHON -c 'import time; time.sleep(21)'" }
}
resource "terraform_data" "barrier" {
  depends_on = [terraform_data.checkpoint_gate]
  provisioner "local-exec" { command = "PYTHON barrier.py" }
}
'''.replace("PYTHON", sys.executable))
        (root / "barrier.py").write_text('from pathlib import Path\nimport time\nPath("entered").touch()\nwhile not Path("release").exists(): time.sleep(.05)\n')
        engine.run("init", "-no-color")
        engine.run("plan", "-no-color", "-out=approved.bin")
        child = engine.start("apply", "-no-color", "approved.bin")
        try:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline and child.poll() is None:
                with mutex:
                    snapshot = objects.get(state_key)
                resources = json.loads(snapshot).get("resources", []) if snapshot else []
                names = {r["name"] for r in resources}
                if (root / "entered").exists() and "checkpoint_gate" in names:
                    if "retained" not in names:
                        raise CheckpointIncomplete("remote checkpoint omitted completed synthetic resource")
                    retained = next(r for r in resources if r["name"] == "retained")
                    identity = retained["instances"][0]["attributes"]["id"]
                    break
                time.sleep(.02)
            else:
                raise RuntimeError("remote checkpoint/barrier not established")
            stop(child)
            with mutex:
                if lock_key not in objects:
                    raise RuntimeError("hard stop did not retain remote lock")
            blocked = engine.start("plan", "-no-color", "-out=blocked.bin")
            try:
                if blocked.wait(timeout=20) == 0 or (root / "blocked.bin").exists() or not conflicts[0]:
                    raise RuntimeError("fresh Plan did not fail on retained lock")
            finally:
                stop(blocked)
            # This releases only an in-memory local-fixture object after this controller's
            # exact child exited. It is not an operational force-unlock implementation.
            if child.poll() is None:
                raise RuntimeError("fixture reconciliation requires confirmed process exit")
            with mutex:
                objects.pop(lock_key)
            (root / "release").touch()
            engine.run("plan", "-no-color", "-out=recovery.bin")
            if engine.changes("recovery.bin").get("terraform_data.retained") != ["no-op"]:
                raise RuntimeError("remote recovery would replace retained resource")
            engine.run("apply", "-no-color", "recovery.bin")
            with mutex:
                final = json.loads(objects[state_key])
                if lock_key in objects:
                    raise RuntimeError("successful recovery left remote lock")
            retained = next(r for r in final["resources"] if r["name"] == "retained")
            if retained["instances"][0]["attributes"]["id"] != identity:
                raise RuntimeError("retained remote resource identity changed")
        finally:
            stop(child)
        print(json.dumps({"event": "synthetic-remote-interruption", "backendProtocol": kind,
                          "initialState": "empty", "result": "passed", "lockRetainedAfterKill": True,
                          "newPlanBlockedUntilFixtureReconciliation": True,
                          "retainedResourceReplaced": False, "cloudOperations": 0}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tofu", required=True, type=Path)
    parser.add_argument("--backend", choices=("http", "s3", "both"), default="both")
    args = parser.parse_args()
    binary = args.tofu.resolve(strict=True)
    if not args.tofu.is_absolute() or not binary.is_file():
        raise RuntimeError("absolute OpenTofu binary required")
    version = subprocess.run([str(binary), "version", "-json"], env={"PATH": "/usr/bin:/bin", "CHECKPOINT_DISABLE": "1"},
                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=True)
    if json.loads(version.stdout).get("terraform_version") != VERSION:
        raise RuntimeError("pinned OpenTofu required")
    for kind in (("http", "s3") if args.backend == "both" else (args.backend,)):
        check(binary, kind)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(json.dumps({"event": "synthetic-remote-interruption-failed", "type": type(error).__name__}), file=sys.stderr)
        raise SystemExit(1)
