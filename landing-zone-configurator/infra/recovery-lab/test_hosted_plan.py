import importlib.util
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("hosted_plan", Path(__file__).with_name("hosted_plan.py"))
hosted = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hosted)
INSTANCE = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
JOB = "33333333-3333-4333-8333-333333333333"
APP = "44444444-4444-4444-8444-444444444444"
SPACE = "55555555-5555-4555-8555-555555555555"
TEMPLATE = "66666666-6666-4666-8666-666666666666"


def event(instance=INSTANCE, age=0):
    return {"event": "application_plan_observation", "instanceId": instance, "jobId": JOB, "observation": "native-plan-observed", "observedAt": datetime.fromtimestamp(time.time()-age, timezone.utc).isoformat().replace("+00:00", "Z")}


class HostedBoundaries(unittest.TestCase):
    def app(self, warm=True):
        return {"guid": APP, "name": "lzc-warm-"+OTHER if warm else "lzc-plan-"+JOB, "state": "STARTED", "relationships": {"space": {"data": {"guid": SPACE}}}}

    def controller(self, confirm=INSTANCE, warm=True):
        controller = object.__new__(hosted.Controller)
        controller.instance, controller.space, controller.template = INSTANCE, SPACE, TEMPLATE
        controller.confirm, controller.stopped = confirm, False
        controller.require_held = False
        controller.boundary_verified = True
        private = tempfile.TemporaryDirectory()
        self.addCleanup(private.cleanup)
        controller.receipt_path = str(Path(private.name) / "receipt.json")
        controller.armed_at = time.time()-1
        controller.api = lambda path, method="GET": self.app(warm) if path == f"/v3/apps/{APP}" else {"pagination": {"next": None}, "resources": [{"guid": OTHER, "state": "RUNNING", "name": "initial-plan"}]}
        return controller

    def test_foreign_instance_stale_and_prearmed_events_are_ignored(self):
        now = time.time()
        for value in [event(OTHER), event(age=5), {**event(), "jobId": "short"}, {**event(), "jobId": {}}, {**event(), "observedAt": None}, {**event(), "password": "never-forward"}]:
            self.assertIsNone(hosted.observation(json.dumps(value, separators=(",", ":")), INSTANCE, now-1, now))
        self.assertIsNone(hosted.observation(json.dumps(event(), separators=(",", ":")), INSTANCE, now+1, now+1))

    def test_observe_mode_finished_and_foreign_jobs_cannot_mutate(self):
        for controller, value, finished in [(self.controller(None), event(), set()), (self.controller(), event(), {JOB}), (self.controller(), event(OTHER), set()), (self.controller(), event(age=5), set())]:
            with patch.object(controller, "api") as api:
                with self.assertRaises(RuntimeError): controller.stop(APP, value, finished)
                api.assert_not_called()

    def test_held_mode_rejects_unheld_and_released_plans(self):
        controller = self.controller()
        controller.require_held = True
        with patch.object(controller, "api") as api:
            for value in [event(), {**event(), "observation": "native-plan-released"}]:
                with self.assertRaises(RuntimeError): controller.stop(APP, value, set())
            api.assert_not_called()
        held = {**event(age=8), "observation": "native-plan-held"}
        controller.armed_at = time.time()-10
        controller.stop(APP, held, set())
        self.assertTrue(controller.stopped)
        self.assertIsNone(hosted.observation(json.dumps({**event(age=16), "observation":"native-plan-held"}, separators=(",", ":")), INSTANCE, time.time()-20, time.time()))

    def test_only_one_exact_warm_runner_can_be_stopped(self):
        controller = self.controller()
        with patch.object(controller, "api", side_effect=controller.api) as api:
            controller.stop(APP, event(), set())
            self.assertEqual([call.args for call in api.call_args_list], [(f"/v3/apps/{APP}",), (f"/v3/apps/{APP}/actions/stop", "POST")])
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertEqual(api.call_count, 2)

    def test_cold_runner_cancels_only_unique_matching_active_task(self):
        controller = self.controller(warm=False)
        original = controller.api
        with patch.object(controller, "api", side_effect=original) as api:
            controller.stop(APP, event(), set())
            self.assertEqual(api.call_args.args, (f"/v3/tasks/{OTHER}/actions/cancel", "POST"))
        controller = self.controller(warm=False)
        with patch.object(controller, "api", side_effect=lambda path: self.app(False) if path == f"/v3/apps/{APP}" else {"pagination": {"next": None}, "resources": []}) as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_target_disappearance_or_expiry_during_validation_prevents_stop(self):
        controller = self.controller()
        with patch.object(controller, "api", return_value={}) as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))
        controller = self.controller()
        value = event()
        def expire(path):
            value["observedAt"] = event(age=10)["observedAt"]
            return self.app()
        with patch.object(controller, "api", side_effect=expire) as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, value, set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_boundary_must_have_been_verified_before_a_stop(self):
        controller = self.controller()
        controller.boundary_verified = False
        with patch.object(controller, "api") as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            api.assert_not_called()

    def test_current_app_in_another_space_cannot_be_stopped(self):
        controller = self.controller()
        app = self.app()
        app["relationships"]["space"]["data"]["guid"] = OTHER
        with patch.object(controller, "api", return_value=app) as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_other_organization_and_public_credential_directory_are_rejected(self):
        controller = self.controller()
        controller.api = lambda path: {"relationships": {"organization": {"data": {"guid": OTHER}}}, "name": "production"}
        with self.assertRaises(RuntimeError): hosted.Controller.boundary(controller)
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            home.chmod(0o755)
            with self.assertRaises(ValueError): hosted.Controller("/bin/true", home, SPACE, TEMPLATE, INSTANCE)

    def test_real_cli_config_location_and_minimal_environment(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder)
            (home / ".cf").mkdir(mode=0o700)
            config = home / ".cf" / "config.json"
            config.write_text(json.dumps({"Target": hosted.API, "SpaceFields": {"GUID": SPACE}}))
            config.chmod(0o600)
            with patch.dict(hosted.os.environ, {"AWS_SECRET_ACCESS_KEY": "never-forward", "CF_PASSWORD": "never-forward"}):
                controller = hosted.Controller("/bin/true", home, SPACE, TEMPLATE, INSTANCE)
                self.assertEqual(set(controller.env), {"PATH", "LANG", "CF_HOME"})
            config.chmod(0o644)
            with self.assertRaises(ValueError): hosted.Controller("/bin/true", home, SPACE, TEMPLATE, INSTANCE)

    def test_empty_cf_stop_response_and_explicit_empty_json_request(self):
        controller = self.controller()
        with patch.object(controller, "call", return_value="") as call:
            self.assertEqual(hosted.Controller.api(controller, f"/v3/apps/{APP}/actions/stop", "POST"), {})
            call.assert_called_once_with(["curl", f"/v3/apps/{APP}/actions/stop", "--fail", "-X", "POST", "-d", "{}"])

    def test_private_cf_errors_are_not_forwarded(self):
        controller = self.controller()
        with patch.object(controller, "call", return_value=json.dumps({"errors": [{"detail": "private-server-detail"}]})):
            with self.assertRaisesRegex(RuntimeError, "private response omitted") as error:
                hosted.Controller.api(controller, "/v3/apps")
            self.assertNotIn("private-server-detail", str(error.exception))

    def test_durable_intent_precedes_stop_and_receipt_cannot_be_reused(self):
        controller = self.controller()
        original = controller.api
        def request(path, method="GET"):
            if method == "GET": return original(path)
            stored = json.loads(Path(controller.receipt_path).read_text())
            self.assertEqual(stored["phase"], "stop-intent")
            self.assertEqual(stored["jobId"], JOB)
            self.assertFalse(stored["qualifiesRecovery"])
            return {}
        controller.api = request
        controller.stop(APP, event(), set())
        self.assertEqual(json.loads(Path(controller.receipt_path).read_text())["phase"], "stop-requested")
        self.assertEqual(Path(controller.receipt_path).stat().st_mode & 0o777, 0o600)
        retry = self.controller()
        retry.receipt_path = controller.receipt_path
        with patch.object(retry, "api", side_effect=retry.api) as api:
            with self.assertRaises(FileExistsError): retry.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_ambiguous_stop_retains_intent_and_prevents_another_mutation(self):
        controller = self.controller()
        original = controller.api
        def ambiguous(path, method="GET"):
            if method == "GET": return original(path)
            raise RuntimeError("ambiguous request")
        with patch.object(controller, "api", side_effect=ambiguous):
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
        self.assertEqual(json.loads(Path(controller.receipt_path).read_text())["phase"], "stop-intent")
        with self.assertRaises(FileExistsError): hosted.Receipt(controller.receipt_path)

    def test_public_receipt_directory_cannot_reach_cloud_mutation(self):
        controller = self.controller()
        controller.receipt_path = "/tmp/never-created-hosted-stop.json"
        with patch.object(controller, "api", side_effect=controller.api) as api:
            with self.assertRaises(ValueError): controller.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))


if __name__ == "__main__": unittest.main()
