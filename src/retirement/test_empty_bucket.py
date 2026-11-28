"""Local S3 protocol fixtures only; never touches STACKIT or real credentials."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock
import tempfile
import json
import hashlib
import stat
import subprocess

spec = importlib.util.spec_from_file_location("empty_bucket", Path(__file__).with_name("empty-bucket.py"))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


class BucketTests(unittest.TestCase):
    def fixture(self, locked=False, failure=False):
        state = {"deleted": False, "writes": []}

        def call(operation, args):
            if operation == "list-object-versions":
                return {"Name": "fixture", "IsTruncated": False, "Versions": [] if state["deleted"] else [{"Key": "state", "VersionId": "null"}], "DeleteMarkers": [] if state["deleted"] else [{"Key": "state", "VersionId": "old"}]}
            if operation == "list-multipart-uploads":
                return {"Bucket": "fixture", "IsTruncated": False}
            if operation == "get-object-lock-configuration":
                return {"ObjectLockConfiguration": {"ObjectLockEnabled": "Enabled"}} if locked else {}
            if operation == "get-object-retention":
                return {"Retention": {"Mode": "COMPLIANCE", "RetainUntilDate": "2099-01-01T00:00:00Z"}}
            if operation == "get-object-legal-hold":
                return {"LegalHold": {"Status": "OFF"}}
            if operation == "delete-objects":
                state["writes"].append(args)
                if failure:
                    return {"Errors": [{"Code": "AccessDenied"}]}
                state["deleted"] = True
                return {"Deleted": [{"Key": "state", "VersionId": "null"}, {"Key": "state", "VersionId": "old"}]}
            if operation == "list-objects-v2":
                return {"Name": "fixture", "IsTruncated": False}
            raise AssertionError("Unexpected S3 operation")
        return state, call

    def test_read_only_until_explicit_apply(self):
        state, call = self.fixture()
        helper.cleanup(call, "fixture")
        self.assertFalse(state["writes"])
        helper.cleanup(call, "fixture", True)
        self.assertTrue(state["deleted"])

    def test_lock_prevents_every_write(self):
        state, call = self.fixture(locked=True)
        with self.assertRaises(ValueError):
            helper.cleanup(call, "fixture", True)
        self.assertFalse(state["writes"])

    def test_partial_delete_is_not_success(self):
        _, call = self.fixture(failure=True)
        with self.assertRaises(ValueError):
            helper.cleanup(call, "fixture", True)

    def test_scope_must_be_an_exact_reviewed_delete(self):
        resource = {"mode": "managed", "type": "stackit_objectstorage_bucket", "change": {"actions": ["delete"], "before": {"id": "11111111-1111-4111-8111-111111111111,eu01,fixture"}}}
        self.assertEqual(helper.target({"resource_changes": [resource]}, "fixture")[2], "fixture")
        for changes in ([], [resource, resource]):
            with self.assertRaises(ValueError):
                helper.target({"resource_changes": changes}, "fixture")

    def test_cli_binds_approval_and_uses_private_batch_files(self):
        resource = {"mode": "managed", "type": "stackit_objectstorage_bucket", "change": {"actions": ["delete"], "before": {"id": "11111111-1111-4111-8111-111111111111,eu01,fixture"}}}
        plan = {"format_version": "1.2", "complete": True, "resource_changes": [resource]}
        state, call = self.fixture()
        paths = []

        def aws(command, **kwargs):
            operation = command[command.index("s3api")+1]
            parameters = command[command.index("s3api")+2:]
            if operation == "delete-objects":
                argument = parameters[parameters.index("--cli-input-json")+1]
                self.assertTrue(argument.startswith("file://"))
                path = Path(argument[7:])
                paths.append(path)
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                self.assertEqual(len(json.loads(path.read_text())["Delete"]["Objects"]), 2)
                self.assertEqual(json.loads(path.read_text())["ChecksumAlgorithm"], "MD5")
            result = call(operation, parameters)
            return subprocess.CompletedProcess(command, 0, json.dumps(result), "")

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "plan.json"
            path.write_text(json.dumps(plan))
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            argv = ["empty-bucket.py", "--plan", str(path), "--bucket", "fixture", "--apply", "--plan-sha256", digest, "--confirm-bucket-contents-deletion"]
            with mock.patch.dict(helper.os.environ, {}, clear=True), mock.patch.object(helper.sys, "argv", argv), mock.patch.object(helper.subprocess, "run") as process:
                with self.assertRaises(helper.CleanupError):
                    helper.main()
                process.assert_not_called()
            argv.append("--confirm-state-backend-outside-target")
            with mock.patch.dict(helper.os.environ, {}, clear=True), mock.patch.object(helper.sys, "argv", argv), mock.patch.object(helper.subprocess, "run", side_effect=aws):
                helper.main()
            self.assertTrue(state["deleted"])
            self.assertEqual(len(paths), 1)
            self.assertFalse(paths[0].exists())


if __name__ == "__main__":
    unittest.main()
