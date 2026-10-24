import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

import held_plan as held
from test_hosted_plan import INSTANCE, APP, SPACE, TEMPLATE, OTHER
SOURCE = "77777777-7777-4777-8777-777777777777"
SLOT = "88888888-8888-4888-8888-888888888888"
CLONED = "99999999-9999-4999-8999-999999999999"
CHECKSUM = {"type":"sha256","value":"a"*64}


class HeldPlanArming(unittest.TestCase):
    def runner(self):
        runner = Mock()
        def api(path, method="GET", body=None):
            if path == "/v3/apps/" + APP:
                return {"name":"lzc-warm-"+SLOT,"relationships":{"space":{"data":{"guid":SPACE}}}}
            if path.endswith("/routes"): return {"resources":[]}
            if path == f"/v3/apps/{APP}/droplets/current": return {"guid":CLONED,"state":"STAGED","checksum":CHECKSUM,"relationships":{"app":{"data":{"guid":APP}}}}
            if path.endswith("/droplets/current"): return {"guid":SOURCE,"state":"STAGED","checksum":CHECKSUM}
            return {}
        runner.api.side_effect = api
        return runner

    def task(self):
        task = Mock()
        task.query.side_effect = [
            [{"id":SLOT,"app_id":APP,"source_droplet_id":SOURCE}],
            [{"status":"ready","app_id":APP,"source_droplet_id":SOURCE,"fresh":True}],
        ]
        return task

    def test_busy_or_absent_standby_never_stops_a_runner(self):
        runner, task = self.runner(), self.task()
        task.query.side_effect = [[]]
        with self.assertRaises(RuntimeError): held.arm(runner,None,task,INSTANCE,SPACE,TEMPLATE,SOURCE,Mock())
        runner.api.assert_not_called()

    def test_source_or_space_mismatch_never_stops_a_runner(self):
        for data in [
            {"name":"lzc-warm-"+SLOT,"relationships":{"space":{"data":{"guid":OTHER}}}},
            {"name":"landing-zone-configurator","relationships":{"space":{"data":{"guid":SPACE}}}},
        ]:
            runner=self.runner();runner.api.side_effect=lambda *args:data
            with self.assertRaises(RuntimeError): held.arm(runner,None,self.task(),INSTANCE,SPACE,TEMPLATE,SOURCE,Mock())
            self.assertTrue(all(len(c.args)==1 for c in runner.api.call_args_list))
        runner=self.runner();original=runner.api.side_effect
        runner.api.side_effect=lambda path,*args: {"guid":OTHER} if path.endswith("/droplets/current") else original(path,*args)
        with self.assertRaises(RuntimeError): held.arm(runner,None,self.task(),INSTANCE,SPACE,TEMPLATE,SOURCE,Mock())
        self.assertTrue(all(len(c.args)==1 for c in runner.api.call_args_list))

    def test_rewarms_only_exact_unassigned_app_and_erases_ticket_from_receipts(self):
        runner,task,record=self.runner(),self.task(),Mock()
        held.arm(runner,None,task,INSTANCE,SPACE,TEMPLATE,SOURCE,record)
        mutations=[c for c in runner.api.call_args_list if len(c.args)>1]
        self.assertEqual([c.args[:2] for c in mutations],[
            (f"/v3/apps/{APP}/actions/stop","POST"),
            (f"/v3/apps/{APP}/environment_variables","PATCH"),
            (f"/v3/apps/{APP}/actions/start","POST"),
        ])
        values=mutations[1].args[2]["var"]
        ticket=values["LZC_POOL_TICKET"]
        self.assertEqual(len(ticket),43)
        self.assertNotIn(ticket,str(record.call_args_list))
        self.assertEqual(held.hashlib.sha256(ticket.encode()).hexdigest(),task.query.call_args_list[0].args[1][3])
        config=json.loads(values["LZC_RECOVERY_PLAN_HOLD"])
        self.assertEqual(config["instanceId"],INSTANCE)
        self.assertEqual(config["appId"],APP)
        self.assertEqual(record.call_args.args[0]["phase"],"ready")
        self.assertEqual(record.call_args.args[0]["clonedDropletId"],CLONED)
        self.assertEqual(record.call_args.args[0]["sourceDropletId"],SOURCE)
        self.assertEqual(record.call_args.args[0]["checksumSha256"],CHECKSUM["value"])
        self.assertTrue(task.query.call_args_list[1].kwargs["wait_ready"])

    def test_clone_requires_matching_sha256_staged_state_and_exact_app(self):
        for change in [
            {"checksum":{"type":"sha256","value":"b"*64}},
            {"checksum":{}}, {"state":"COPYING"}, {"guid":SOURCE},
            {"relationships":{"app":{"data":{"guid":OTHER}}}},
        ]:
            runner=self.runner();original=runner.api.side_effect
            runner.api.side_effect=lambda path,*args: {**original(path,*args),**change} if path==f"/v3/apps/{APP}/droplets/current" else original(path,*args)
            with self.assertRaises(RuntimeError): held.arm(runner,None,self.task(),INSTANCE,SPACE,TEMPLATE,SOURCE,Mock())
            self.assertTrue(all(len(c.args)==1 for c in runner.api.call_args_list))
        for checksum in [None, {}, {"type":"sha256","value":None}, {"type":"sha1","value":"a"*40}, {"type":"sha256","value":"not-a-hash"}]:
            runner=self.runner();original=runner.api.side_effect
            runner.api.side_effect=lambda path,*args: {**original(path,*args),"checksum":checksum} if path==f"/v3/apps/{TEMPLATE}/droplets/current" else original(path,*args)
            with self.assertRaises(RuntimeError): held.arm(runner,None,self.task(),INSTANCE,SPACE,TEMPLATE,SOURCE,Mock())
            self.assertTrue(all(len(c.args)==1 for c in runner.api.call_args_list))

    def test_failed_readiness_does_not_claim_ready(self):
        task=self.task();task.query.side_effect=[[{"id":SLOT,"app_id":APP,"source_droplet_id":SOURCE}],[]]
        record=Mock()
        with self.assertRaises(RuntimeError): held.arm(self.runner(),None,task,INSTANCE,SPACE,TEMPLATE,SOURCE,record)
        self.assertNotIn("ready",[c.args[0]["phase"] for c in record.call_args_list])

    def test_delayed_receipt_polls_logs_without_replaying_sql(self):
        client = Mock()
        def call(args):
            if args[0] == "run-task":
                self.task_name = args[args.index("--name") + 1]
                return ""
            if not hasattr(self, "logs_seen"):
                self.logs_seen = True
                return ""
            return f'[APP/TASK/{self.task_name}/0] OUT DRILL_QUERY=[{{"status":"ready"}}]'
        client.call.side_effect = call
        operator = held.OperatorTask(client, APP, {})
        with patch.object(held.time, "sleep"):
            self.assertEqual(operator.query("SELECT $1", ["safe"]), [{"status":"ready"}])
        self.assertEqual(sum(c.args[0][0] == "run-task" for c in client.call.call_args_list), 1)
        self.assertEqual(sum(c.args[0][0] == "logs" for c in client.call.call_args_list), 2)

    def test_public_or_symlinked_credentials_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/"private.json";path.write_text("private-only");path.chmod(0o644)
            with self.assertRaises(ValueError):held.private_file(path)
            path.chmod(0o600);link=Path(folder)/"link";link.symlink_to(path)
            with self.assertRaises(ValueError):held.private_file(link)
            self.assertEqual(held.private_file(path),path)


if __name__ == "__main__": unittest.main()
