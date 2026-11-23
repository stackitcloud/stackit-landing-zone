import copy
import unittest
from guard import check_plan, check_private_plan, inventory, verify_state


class RetirementGuardTests(unittest.TestCase):
    def setUp(self):
        self.folder = 'module.governance.stackit_resourcemanager_folder.this["platform"]'
        self.project = 'module.management.stackit_resourcemanager_project.this'
        self.captured = {'schemaVersion': 1, 'resources': [
            {'address': self.folder, 'type': 'stackit_resourcemanager_folder', 'id': 'folder-id'},
            {'address': self.project, 'type': 'stackit_resourcemanager_project', 'id': 'project-id', 'selectors': {'project_id': 'project-id'}}]}
        self.plan = {'format_version': '1.2', 'complete': True, 'resource_changes': [
            {'address': self.project, 'type': 'stackit_resourcemanager_project', 'mode': 'managed',
             'change': {'actions': ['delete'], 'before': {'project_id': 'project-id'}}}]}

    def test_only_approved_project_removed(self):
        self.assertEqual(check_plan(self.plan, self.captured, 'remove_projects')['deleteCount'], 1)

    def test_folder_deletion_only_in_finalization(self):
        change = {'address': self.folder, 'type': 'stackit_resourcemanager_folder', 'mode': 'managed',
                  'change': {'actions': ['delete'], 'before': {'folder_id': 'folder-id'}}}
        plan = {'format_version': '1.2', 'resource_changes': [change]}
        with self.assertRaisesRegex(ValueError, 'governance_must_remain'):
            check_plan(plan, self.captured, 'remove_projects')
        self.assertEqual(check_plan(plan, self.captured, 'finalize_folders')['deleteCount'], 1)
        with self.assertRaises(ValueError):
            check_plan(self.plan, self.captured, 'finalize_folders')

    def test_create_update_replacement_and_forget_are_refused(self):
        for actions in [['create'], ['update'], ['delete', 'create'], ['create', 'delete'], ['forget']]:
            with self.subTest(actions=actions):
                plan = copy.deepcopy(self.plan)
                plan['resource_changes'][0]['change']['actions'] = actions
                with self.assertRaises(ValueError):
                    check_plan(plan, self.captured, 'remove_projects')

    def test_wrong_cloud_identity_and_unreviewed_address_are_refused(self):
        for field, value in [('address', 'module.foreign.stackit_resourcemanager_project.this'),
                             ('type', 'stackit_resourcemanager_folder')]:
            plan = copy.deepcopy(self.plan)
            plan['resource_changes'][0][field] = value
            with self.assertRaises(ValueError):
                check_plan(plan, self.captured, 'remove_projects')
        plan = copy.deepcopy(self.plan)
        plan['resource_changes'][0]['change']['before']['project_id'] = 'foreign-id'
        with self.assertRaises(ValueError):
            check_plan(plan, self.captured, 'remove_projects')

    def test_refresh_disappearance_is_not_proof_of_deletion(self):
        plan = {'format_version': '1.2', 'resource_changes': [], 'resource_drift': [
            {'address': self.project, 'mode': 'managed', 'change': {'actions': ['delete']}}]}
        with self.assertRaisesRegex(ValueError, 'disappeared_during_refresh'):
            check_plan(plan, self.captured, 'remove_projects')

    def test_partial_or_deferred_plan_is_not_approved(self):
        for changed in [{'complete': False}, {'errored': True}, {'deferred_changes': [{}]}]:
            with self.assertRaises(ValueError):
                check_plan({**self.plan, **changed}, self.captured, 'remove_projects')

    def test_state_inventory_preserves_identity_without_secrets(self):
        state = {'version': 4, 'lineage': 'lineage', 'serial': 3, 'resources': [{
            'module': 'module.governance', 'mode': 'managed', 'type': 'stackit_resourcemanager_folder',
            'name': 'this', 'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]',
            'instances': [{'index_key': 'platform', 'attributes': {'folder_id': 'folder-id', 'password': 'never-export'}}]}]}
        result = inventory(state)
        self.assertEqual(result['resources'][0]['address'], self.folder)
        self.assertNotIn('never-export', str(result))
        state['resources'][0]['provider'] = 'module.demo.provider["registry.opentofu.org/grafana/grafana"].observability'
        with self.assertRaisesRegex(ValueError, 'private_provider'):
            inventory(state)

    def test_wrong_state_lineage_or_new_resources_cannot_be_used_as_resume(self):
        state = {'version': 4, 'lineage': 'original', 'serial': 3, 'resources': []}
        captured = {**self.captured, 'lineage': 'original', 'serial': 2}
        self.assertEqual(verify_state(state, captured)['resourceCount'], 0)
        with self.assertRaisesRegex(ValueError, 'lineage_changed'):
            verify_state({**state, 'lineage': 'new-empty-state'}, captured)
        with self.assertRaisesRegex(ValueError, 'serial_regressed'):
            verify_state({**state, 'serial': 1}, captured)

    def test_arbitrary_json_is_not_a_valid_plan(self):
        with self.assertRaisesRegex(ValueError, 'unsupported_plan_format'):
            check_plan({}, self.captured, 'remove_projects')

    def test_deposed_state_is_not_a_normal_cleanup_candidate(self):
        with self.assertRaises(ValueError):
            inventory({'version': 4, 'lineage': 'test', 'serial': 1, 'resources': [{
                'mode': 'managed', 'type': 'stackit_resourcemanager_project', 'name': 'this',
                'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]',
                'instances': [{'deposed': '1', 'attributes': {'project_id': 'pending'}}]}]})


    def test_original_source_private_cleanup_never_deletes_its_control_plane(self):
        address = 'module.management.vault_kv_secret_v2.object_storage_credentials'
        state = {'version': 4, 'lineage': 'private-original', 'serial': 1, 'resources': [
            {'module': 'module.management', 'mode': 'managed', 'type': 'vault_kv_secret_v2', 'name': 'object_storage_credentials',
             'provider': 'provider["registry.opentofu.org/hashicorp/vault"]',
             'instances': [{'attributes': {'id': 'mount/data/object-storage', 'data_json': 'SECRET_SENTINEL'}}]},
            {'module': 'module.management', 'mode': 'managed', 'type': 'stackit_resourcemanager_project', 'name': 'this',
             'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]',
             'instances': [{'attributes': {'project_id': 'project-id'}}]}]}
        plan = {'format_version': '1.2', 'resource_changes': [
            {'address': address, 'mode': 'managed', 'type': 'vault_kv_secret_v2',
             'change': {'actions': ['delete'], 'before': {'id': 'mount/data/object-storage'}}}]}
        self.assertEqual(check_private_plan(plan, state)['deleteCount'], 1)
        with self.assertRaisesRegex(ValueError, 'private_cleanup_incomplete'):
            check_private_plan({'format_version': '1.2', 'resource_changes': []}, state)
        plan['resource_changes'].extend(self.plan['resource_changes'])
        with self.assertRaisesRegex(ValueError, 'must_retain_cloud_infrastructure'):
            check_private_plan(plan, state)
        plan['resource_changes'] = [plan['resource_changes'][0]]
        plan['resource_changes'][0]['change']['actions'] = ['update']
        with self.assertRaisesRegex(ValueError, 'delete_only'):
            check_private_plan(plan, state)


    def test_missing_id_requires_exact_role_selectors(self):
        state = {'version': 4, 'lineage': 'role-state', 'serial': 1, 'resources': [{
            'module': 'module.management', 'mode': 'managed', 'type': 'stackit_authorization_organization_role_assignment', 'name': 'automation',
            'provider': 'provider["registry.opentofu.org/stackitcloud/stackit"]',
            'instances': [{'attributes': {'resource_id': 'organization-id', 'role': 'owner', 'subject': 'automation@example.com'}}]}]}
        captured = inventory(state)
        plan = {'format_version': '1.2', 'resource_changes': [{
            'address': captured['resources'][0]['address'], 'type': captured['resources'][0]['type'], 'mode': 'managed',
            'change': {'actions': ['delete'], 'before': {'resource_id': 'organization-id', 'role': 'owner', 'subject': 'automation@example.com'}}}]}
        self.assertEqual(check_plan(plan, captured, 'remove_projects', captured)['deleteCount'], 1)
        plan['resource_changes'][0]['change']['before']['subject'] = 'foreign@example.com'
        with self.assertRaisesRegex(ValueError, 'resource_identity_changed'):
            check_plan(plan, captured, 'remove_projects', captured)

    def test_cli_review_requires_all_current_resources(self):
        with self.assertRaisesRegex(ValueError, 'plan_inventory_incomplete'):
            check_plan(self.plan, self.captured, 'remove_projects', self.captured)


if __name__ == '__main__':
    unittest.main()
