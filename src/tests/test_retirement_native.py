"""Real provider/engine retirement flow against an isolated loopback fake API."""
import http.server
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import unittest
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]
TOFU = os.environ.get('LZC_TEST_TOFU_BIN')
FOLDER = '11111111-1111-4111-8111-111111111111'
PROJECT = '22222222-2222-4222-8222-222222222222'
ORG = '33333333-3333-4333-8333-333333333333'
CONTAINER = 'folder-test-retirement'


@unittest.skipUnless(TOFU, 'Set LZC_TEST_TOFU_BIN to the pinned OpenTofu binary')
class NativeRetirementTest(unittest.TestCase):
    def test_same_state_project_removal_wait_and_folder_finalization(self):
        specification = importlib.util.spec_from_file_location('retirement_guard', REPO / 'src/retirement/guard.py')
        guard = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(guard)
        state = {'deny_project': False, 'deleted_project': False, 'purged': False, 'deleted_folder': False, 'calls': []}

        class API(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def respond(self, code, data):
                self.send_response(code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())

            def do_GET(self):
                state['calls'].append(('GET', self.path))
                if urlsplit(self.path).path in (f'/v2/folders/{FOLDER}', f'/v2/folders/{CONTAINER}'):
                    return self.respond(404, {}) if state['deleted_folder'] else self.respond(200, {
                        'folderId': FOLDER, 'containerId': CONTAINER, 'name': 'Disposable retirement test',
                        'parent': {'containerId': ORG, 'id': ORG, 'type': 'ORGANIZATION'}, 'lifecycleState': 'ACTIVE', 'labels': {'landing_zone_accelerator': 'true', 'environment': 'dev-retirement-pilot'}, 'creationTime': '2026-01-01T00:00:00Z', 'updateTime': '2026-01-01T00:00:00Z', 'ownerEmail': 'owner@example.com'})
                if urlsplit(self.path).path in (f'/v2/projects/{PROJECT}', '/v2/projects/project-test-retirement'):
                    if state['deny_project']:
                        return self.respond(403, {'message': 'Denied'})
                    return self.respond(404, {}) if state['deleted_project'] else self.respond(200, {
                        'projectId': PROJECT, 'containerId': 'project-test-retirement', 'name': 'Disposable project',
                        'parent': {'containerId': CONTAINER, 'id': FOLDER, 'type': 'FOLDER'}, 'lifecycleState': 'ACTIVE', 'labels': {'landing_zone_accelerator': 'true', 'environment': 'dev-retirement-pilot'}, 'creationTime': '2026-01-01T00:00:00Z', 'updateTime': '2026-01-01T00:00:00Z', 'ownerEmail': 'owner@example.com'})
                return self.respond(500, {'message': 'Unexpected test endpoint: ' + self.path})

            def do_DELETE(self):
                state['calls'].append(('DELETE', self.path))
                if urlsplit(self.path).path in (f'/v2/projects/{PROJECT}', '/v2/projects/project-test-retirement'):
                    state['deleted_project'] = True
                    return self.respond(204, {})
                if urlsplit(self.path).path in (f'/v2/folders/{FOLDER}', f'/v2/folders/{CONTAINER}'):
                    if not state['purged']:
                        return self.respond(409, {'error': 'Conflict', 'status': 409, 'message': f'[FOLDER] has children of type project. Forced deletion not permitted for containerId[{FOLDER}]', 'path': f'/v2/folders/{CONTAINER}', 'timeStamp': '2026-11-23T00:00:00Z'})
                    state['deleted_folder'] = True
                    return self.respond(204, {})
                return self.respond(500, {})

        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), API)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory(prefix='lza-retirement-native-') as directory:
                root = Path(directory)
                shutil.copytree(REPO / 'src' / 'retirement', root / 'retirement',
                                ignore=shutil.ignore_patterns('.terraform', '__pycache__', '*.tfstate*', 'tests', 'backend.local.tf', '*.tfvars*', '*.tfplan', '*.bin', '*.log'))
                shutil.copytree(REPO / 'src' / 'modules' / 'governance', root / 'modules' / 'governance')
                work = root / 'retirement'
                provider = work / 'providers.tf'
                provider.write_text(provider.read_text().replace('  default_region',
                    f'  service_account_token = "test-only"\n  resourcemanager_custom_endpoint = "http://127.0.0.1:{server.server_port}"\n  default_region'))
                variables = {'organization_id': ORG, 'owner_email': 'owner@example.com',
                             'rm_folders': {'platform': {'name': 'Disposable retirement test'}},
                             'labels': {'environment': 'dev-retirement-pilot'},
                             'retirement_phase': 'remove_projects'}
                (work / 'retirement.tfvars.json').write_text(json.dumps(variables))
                raw = {'version': 4, 'terraform_version': '1.12.6', 'serial': 1,
                       'lineage': '44444444-4444-4444-8444-444444444444', 'outputs': {}, 'resources': [
                    {'module': 'module.governance', 'mode': 'managed', 'type': 'stackit_resourcemanager_folder', 'name': 'this',
                     'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]', 'instances': [
                         {'index_key': 'platform', 'schema_version': 0, 'attributes': {
                             'folder_id': FOLDER, 'container_id': CONTAINER, 'name': 'Disposable retirement test',
                             'parent_container_id': ORG, 'owner_email': 'owner@example.com', 'labels': {'landing_zone_accelerator': 'true', 'environment': 'dev-retirement-pilot'}}}]},
                    {'module': 'module.management', 'mode': 'managed', 'type': 'stackit_resourcemanager_project', 'name': 'this',
                     'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]', 'instances': [
                         {'schema_version': 0, 'attributes': {'project_id': PROJECT, 'container_id': 'project-test-retirement',
                          'name': 'Disposable project', 'parent_container_id': CONTAINER,
                          'owner_email': 'owner@example.com', 'labels': None},
                          'dependencies': ['module.governance.stackit_resourcemanager_folder.this']}]}]}
                # Synthetic local test State only; never writes an existing or remote backend.
                env = {key: value for key, value in os.environ.items()
                       if not key.startswith(('STACKIT_', 'AWS_', 'TF_', 'LZC_'))}
                if os.environ.get('TF_CLI_CONFIG_FILE'):
                    env['TF_CLI_CONFIG_FILE'] = os.environ['TF_CLI_CONFIG_FILE']
                mirror = os.environ.get('LZC_TEST_PROVIDER_MIRROR')
                if mirror:
                    config = root / 'providers.tfrc'
                    config.write_text('provider_installation { filesystem_mirror { path = ' + json.dumps(str(Path(mirror).resolve())) + ' } }')
                    env['TF_CLI_CONFIG_FILE'] = str(config)
                version = subprocess.run([TOFU, 'version', '-json'], cwd=work, env=env,
                                         capture_output=True, text=True, check=True, timeout=15)
                raw['terraform_version'] = json.loads(version.stdout)['terraform_version']
                (work / 'terraform.tfstate').write_text(json.dumps(raw))
                def run(*args, success=True):
                    result = subprocess.run([TOFU, *args], cwd=work, env=env,
                                            capture_output=True, text=True, timeout=90)
                    if success:
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    else:
                        self.assertNotEqual(result.returncode, 0)
                    return result
                run('init', '-backend=false', '-input=false', '-lockfile=readonly', '-no-color')
                captured = guard.inventory(raw)
                state['deny_project'] = True
                run('plan', '-input=false', '-var-file=retirement.tfvars.json', '-out=denied.bin', '-no-color')
                denied = json.loads(run('show', '-json', 'denied.bin').stdout)
                with self.assertRaisesRegex(ValueError, 'disappeared_during_refresh'):
                    guard.check_plan(denied, captured, 'remove_projects')
                self.assertFalse(any(method == 'DELETE' for method, _ in state['calls']))
                state['deny_project'] = False
                run('plan', '-input=false', '-var-file=retirement.tfvars.json', '-out=phase-a.bin', '-no-color')
                planned = json.loads(run('show', '-json', 'phase-a.bin').stdout)
                self.assertEqual(guard.check_plan(planned, captured, 'remove_projects')['deleteCount'], 1)
                actions = {r['address']: r['change']['actions'] for r in planned['resource_changes'] if r['mode'] == 'managed'}
                self.assertEqual(actions['module.management.stackit_resourcemanager_project.this'], ['delete'])
                self.assertEqual(actions[f'module.governance.stackit_resourcemanager_folder.this["platform"]'], ['no-op'])
                run('apply', '-input=false', '-no-color', 'phase-a.bin')
                self.assertTrue(state['deleted_project'])
                self.assertFalse(any(method == 'DELETE' and 'folders' in path for method, path in state['calls']))
                current = json.loads((work / 'terraform.tfstate').read_text())
                self.assertEqual(current['lineage'], raw['lineage'])
                self.assertEqual(current['resources'][0]['instances'][0]['attributes']['folder_id'], FOLDER)
                variables['retirement_phase'] = 'finalize_folders'
                (work / 'retirement.tfvars.json').write_text(json.dumps(variables))
                run('plan', '-input=false', '-var-file=retirement.tfvars.json', '-out=waiting.bin', '-no-color')
                waiting = json.loads(run('show', '-json', 'waiting.bin').stdout)
                self.assertEqual(guard.check_plan(waiting, captured, 'finalize_folders', guard.inventory(current))['deleteCount'], 1)
                result = run('apply', '-json', '-input=false', '-no-color', 'waiting.bin', success=False)
                self.assertIn('409', result.stderr + result.stdout)
                diagnostics = [event['diagnostic'] for event in map(json.loads, result.stdout.splitlines())
                               if event.get('type') == 'diagnostic' and event['diagnostic']['severity'] == 'error']
                self.assertEqual(len(diagnostics), 1)
                self.assertEqual(diagnostics[0]['summary'], 'Error deleting folder. Deletion may fail because associated projects remain hidden for up to 7 days after user deletion due to technical requirements.')
                if os.environ.get('LZC_RETIREMENT_DIAGNOSTIC_FILE'):
                    Path(os.environ['LZC_RETIREMENT_DIAGNOSTIC_FILE']).write_text(result.stdout + result.stderr)
                self.assertIn('Calling API: 409 Conflict', diagnostics[0]['detail'])
                self.assertTrue(any(event.get('type') == 'apply_errored' and event['hook']['action']=='delete' and event['hook']['resource']['addr']==f'module.governance.stackit_resourcemanager_folder.this["platform"]' for event in map(json.loads,result.stdout.splitlines())))

                self.assertFalse(state['deleted_folder'])
                state['purged'] = True
                run('plan', '-input=false', '-var-file=retirement.tfvars.json', '-out=final.bin', '-no-color')
                run('apply', '-input=false', '-no-color', 'final.bin')
                self.assertTrue(state['deleted_folder'])
                current = json.loads((work / 'terraform.tfstate').read_text())
                self.assertEqual(current['lineage'], raw['lineage'])
                self.assertFalse(current['resources'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
