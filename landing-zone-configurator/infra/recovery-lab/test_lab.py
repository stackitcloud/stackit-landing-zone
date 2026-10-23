import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("recovery_lab", Path(__file__).with_name("lab.py"))
lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lab)


class RecoveryLabBoundaries(unittest.TestCase):
    def test_remote_docker_and_cloud_environment_are_not_inherited(self):
        with patch.dict(lab.os.environ, {"DOCKER_HOST": "tcp://remote:2375", "DOCKER_CONTEXT": "production", "AWS_ACCESS_KEY_ID": "mock-only"}), patch.object(lab.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, b"ok", b"")) as call:
            self.assertEqual(lab.run(["docker", "version"]), b"ok")
            env = call.call_args.kwargs["env"]
            self.assertEqual(env["DOCKER_HOST"], "unix:///var/run/docker.sock")
            self.assertNotIn("DOCKER_CONTEXT", env)
            self.assertNotIn("AWS_ACCESS_KEY_ID", env)

    def test_arbitrary_backup_cannot_reach_docker(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(lab, "PRIVATE", Path(folder) / "private"), patch.object(lab, "container") as container:
            with self.assertRaises(RuntimeError):
                lab.restore(Path(folder) / "foreign-backup")
            container.assert_not_called()

    def test_tampered_backup_cannot_reach_restore_target(self):
        with tempfile.TemporaryDirectory() as folder:
            private = Path(folder)
            backup = private / "backup-test"
            backup.mkdir()
            (backup / "database.dump").write_bytes(b"changed")
            (backup / "roles.sql").write_bytes(b"synthetic")
            (backup / "manifest.json").write_text(json.dumps({"origin": "local-recovery-lab-only", "databaseSha256": "bad", "rolesSha256": "bad"}))
            with patch.object(lab, "PRIVATE", private), patch.object(lab, "container") as container:
                with self.assertRaises(RuntimeError): lab.restore(backup)
                container.assert_not_called()

    def test_private_directory_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            link = Path(folder) / "private"
            link.symlink_to(Path(folder), target_is_directory=True)
            with patch.object(lab, "PRIVATE", link):
                with self.assertRaises(RuntimeError): lab.private_dir()

    def test_unmanaged_container_is_rejected(self):
        with patch.object(lab, "compose", return_value=b"synthetic-id"), patch.object(lab, "run", return_value=json.dumps([{"Config": {"Labels": {}}}]).encode()):
            with self.assertRaises(RuntimeError): lab.container("restored")

    def test_command_errors_do_not_expose_backup_or_password(self):
        with patch.object(lab.subprocess, "run", return_value=subprocess.CompletedProcess([], 1, b"private-backup", b"private-password")):
            with self.assertRaises(RuntimeError) as caught: lab.run(["docker", "exec"])
            self.assertNotIn("private-backup", str(caught.exception))
            self.assertNotIn("private-password", str(caught.exception))


if __name__ == "__main__": unittest.main()
