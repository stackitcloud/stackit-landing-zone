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
    def controller(self, confirm=INSTANCE, warm=True):
        controller = object.__new__(hosted.Controller)
        controller.instance, controller.space, controller.template = INSTANCE, SPACE, TEMPLATE
        controller.confirm, controller.stopped = confirm, False
        controller.armed_at = time.time()-1
        controller.boundary = lambda: None
        controller.apps = lambda: {APP: {"name": "lzc-warm-"+OTHER if warm else "lzc-plan-"+JOB, "state": "STARTED"}}
        controller.api = lambda path, method="GET": {"pagination": {"next": None}, "resources": [{"guid": OTHER, "state": "RUNNING", "name": "initial-plan"}]}
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

    def test_only_one_exact_warm_runner_can_be_stopped(self):
        controller = self.controller()
        with patch.object(controller, "api", return_value={}) as api:
            controller.stop(APP, event(), set())
            api.assert_called_once_with(f"/v3/apps/{APP}/actions/stop", "POST")
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertEqual(api.call_count, 1)

    def test_cold_runner_cancels_only_unique_matching_active_task(self):
        controller = self.controller(warm=False)
        original = controller.api
        with patch.object(controller, "api", side_effect=original) as api:
            controller.stop(APP, event(), set())
            self.assertEqual(api.call_args.args, (f"/v3/tasks/{OTHER}/actions/cancel", "POST"))
        controller = self.controller(warm=False)
        with patch.object(controller, "api", return_value={"pagination": {"next": None}, "resources": []}) as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            self.assertTrue(all(len(call.args) == 1 for call in api.call_args_list))

    def test_target_disappearance_or_expiry_during_validation_prevents_stop(self):
        controller = self.controller()
        controller.apps = lambda: {}
        with patch.object(controller, "api") as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, event(), set())
            api.assert_not_called()
        controller = self.controller()
        value = event()
        def expire():
            value["observedAt"] = event(age=10)["observedAt"]
            return {APP: {"name": "lzc-warm-"+OTHER, "state": "STARTED"}}
        controller.apps = expire
        with patch.object(controller, "api") as api:
            with self.assertRaises(RuntimeError): controller.stop(APP, value, set())
            api.assert_not_called()

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
            call.assert_called_once_with(["curl", f"/v3/apps/{APP}/actions/stop", "-X", "POST", "-d", "{}"])


if __name__ == "__main__": unittest.main()
