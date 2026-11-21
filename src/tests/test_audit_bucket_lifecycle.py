"""Offline legacy-State plans against the real pinned Object Storage provider."""
import http.server
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[2]
PROJECT = "11111111-1111-4111-8111-111111111111"
PROVIDER = 'provider["registry.opentofu.org/stackitcloud/stackit"]'


class AuditBucketLifecycle(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="lza-audit-lifecycle-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.directory = Path(cls.temporary.name)
        cls.requests = []

        class RejectNetwork(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                cls.requests.append(self.path)
                self.send_error(503, "Network calls are forbidden in this plan test")
            do_POST = do_PUT = do_DELETE = do_GET
            def log_message(self, *_args):
                pass

        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), RejectNetwork)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.server.server_close)
        cls.addClassCleanup(cls.thread.join)
        cls.addClassCleanup(cls.server.shutdown)
        cls.tofu = os.environ["LZC_TEST_TOFU_BIN"]
        if not Path(cls.tofu).is_absolute():
            raise AssertionError("Use an absolute pinned OpenTofu binary")
        cls.env = {"PATH": os.environ["PATH"], "TF_INPUT": "0", "TF_IN_AUTOMATION": "true", "CHECKPOINT_DISABLE": "1"}
        cli = cls.directory / "tofu.tfrc"
        mirror = os.environ.get("LZC_TEST_PROVIDER_MIRROR")
        cli.write_text('provider_installation { filesystem_mirror { path = ' + json.dumps(mirror) + ' } }\n' if mirror else '')
        cls.env["TF_CLI_CONFIG_FILE"] = str(cli)
        # Use the actual production resource declarations, with only the parent
        # project reference replaced by a fixed fixture input. No cloud project
        # or credentials are required, and unrelated services are not copied.
        storage = (ROOT / "src/modules/management/3-object-storage.tf").read_text().split("#################\n## CREDENTIALS ##")[0]
        storage = storage.replace("stackit_resourcemanager_project.this.project_id", "var.project_id")
        (cls.directory / "storage.tf").write_text(storage)
        shutil.copy(ROOT / "src/modules/management/variables.tf", cls.directory / "variables.tf")
        lock = (ROOT / "src/.terraform.lock.hcl").read_text()
        provider_lock = re.search(r'provider "registry.opentofu.org/stackitcloud/stackit" \{.*?^\}', lock, re.S | re.M)
        if provider_lock is None:
            raise AssertionError("Pinned Object Storage provider lock is required")
        (cls.directory / ".terraform.lock.hcl").write_text(provider_lock.group(0) + "\n")
        endpoint = f"http://127.0.0.1:{cls.server.server_port}"
        (cls.directory / "main.tf").write_text('''terraform {
  required_providers {
    stackit = { source = "stackitcloud/stackit", version = "0.114.0" }
  }
}
variable "project_id" { type = string }
provider "stackit" {
  default_region = "eu01"
  service_account_token = "synthetic-unused-token"
  objectstorage_custom_endpoint = "''' + endpoint + '''"
  token_custom_endpoint = "''' + endpoint + '''"
}
''')
        result = cls.command("init", "-backend=false", "-input=false", "-lockfile=readonly", "-no-color")
        if result.returncode:
            raise AssertionError(result.stdout + result.stderr)

    @classmethod
    def command(cls, *args):
        return subprocess.run([cls.tofu, *args], cwd=cls.directory, env=cls.env, text=True, capture_output=True, timeout=90)

    def plan(self, audit, locked=True, archive=True):
        resources = []
        def resource(kind, name, attributes, indexed=False):
            instance = {"schema_version": 0, "attributes": attributes, "sensitive_attributes": []}
            if indexed:
                instance["index_key"] = 0
            resources.append({"mode": "managed", "type": kind, "name": name, "provider": PROVIDER, "instances": [instance]})
        for purpose in ["default", "tfstate"] + (["audit-logs"] if archive else []):
            name = f"tst-{PROJECT}-{purpose}"
            resource("stackit_objectstorage_bucket", "audit_logs" if purpose == "audit-logs" else purpose, {
                "id": f"{PROJECT},eu01,{name}", "project_id": PROJECT, "region": "eu01", "name": name,
                "object_lock": locked if purpose == "audit-logs" else False,
                "url_path_style": f"https://object.storage.eu01.onstackit.cloud/{name}",
                "url_virtual_hosted_style": f"https://{name}.object.storage.eu01.onstackit.cloud",
            })
        if archive and locked:
            resource("stackit_objectstorage_compliance_lock", "this", {"id": f"{PROJECT},eu01", "project_id": PROJECT, "region": "eu01", "max_retention_days": 365}, True)
            resource("stackit_objectstorage_default_retention", "audit_logs", {"id": f"{PROJECT},eu01,tst-{PROJECT}-audit-logs", "project_id": PROJECT, "region": "eu01", "bucket_name": f"tst-{PROJECT}-audit-logs", "days": 180, "mode": "GOVERNANCE"}, True)
        (self.directory / "terraform.tfstate").write_text(json.dumps({"version": 4, "terraform_version": "1.12.6", "serial": 1, "lineage": PROJECT, "outputs": {}, "resources": resources}))
        (self.directory / "fixture.auto.tfvars.json").write_text(json.dumps({"project_id": PROJECT, "naming_pattern": "tst", "parent_container_id": PROJECT, "organization_id": PROJECT, "owner_email": "owner@example.test", "audit_logs": audit}))
        result = self.command("plan", "-refresh=false", "-input=false", "-out=plan.bin", "-no-color")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        result = self.command("show", "-json", "plan.bin")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.requests, [], "An offline plan must never call any service")
        return {entry["address"]: entry for entry in json.loads(result.stdout).get("resource_changes", [])}

    def test_enabled_legacy_archive_moves_without_replacement(self):
        changes = self.plan({})
        archive = changes["stackit_objectstorage_bucket.audit_logs[0]"]
        self.assertEqual(archive.get("previous_address"), "stackit_objectstorage_bucket.audit_logs")
        self.assertTrue(all(entry["change"]["actions"] == ["no-op"] for entry in changes.values()))

    def test_disabling_locked_legacy_archive_only_deletes_audit_storage(self):
        changes = self.plan(None)
        for address, entry in changes.items():
            expected = ["no-op"] if address in ["stackit_objectstorage_bucket.default", "stackit_objectstorage_bucket.tfstate"] else ["delete"]
            self.assertEqual(entry["change"]["actions"], expected, address)
        self.assertEqual(len(changes), 5)

    def test_disabling_unlocked_legacy_archive_does_not_recreate_it(self):
        changes = self.plan(None, locked=False)
        self.assertEqual(changes["stackit_objectstorage_bucket.audit_logs[0]"]["change"]["actions"], ["delete"])
        self.assertEqual(len(changes), 3)

    def test_disabled_deployment_has_no_new_archive(self):
        changes = self.plan(None, archive=False)
        self.assertEqual(set(changes), {"stackit_objectstorage_bucket.default", "stackit_objectstorage_bucket.tfstate"})
        self.assertTrue(all(entry["change"]["actions"] == ["no-op"] for entry in changes.values()))

    def test_explicit_lock_change_still_requires_replacement(self):
        changes = self.plan({"s3_object_lock": False})
        self.assertEqual(changes["stackit_objectstorage_bucket.audit_logs[0]"]["change"]["actions"], ["delete", "create"])


if __name__ == "__main__":
    unittest.main()
