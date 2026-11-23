#!/usr/bin/env python3
"""Offline retirement inventory/plan checks. Never invokes OpenTofu or a cloud API."""
import argparse
import hashlib
import json
import os
import re
import sys

FOLDER = 'module.governance.stackit_resourcemanager_folder.this'
PROVIDER = re.compile(r'^provider\["registry\.(?:opentofu|terraform)\.org/(?:stackitcloud/stackit|hashicorp/(?:random|time))"\](?:\.(?:eu01|eu02))?$')


def require(condition, code):
    if not condition:
        raise ValueError(code)


def inventory(state):
    require(state.get('version') == 4 and isinstance(state.get('lineage'), str)
            and isinstance(state.get('serial'), int), 'unsupported_state')
    resources = []
    for resource in state.get('resources', []):
        require(resource.get('mode') in ('managed', 'data'), 'unsupported_state_resource_mode')
        if resource.get('mode') != 'managed':
            continue
        require(PROVIDER.fullmatch(resource.get('provider', '')) is not None,
                'remove_private_provider_workloads_with_original_source_first')
        address = '.'.join(filter(None, [resource.get('module'), resource['type'], resource['name']]))
        for instance in resource.get('instances', []):
            require(not instance.get('deposed'), 'unresolved_deposed_instance')
            indexed = address
            if 'index_key' in instance:
                indexed += '[' + json.dumps(instance['index_key'], ensure_ascii=False, separators=(',', ':')) + ']'
            attributes = instance.get('attributes', {})
            identifier = attributes.get('folder_id') if resource['type'] == 'stackit_resourcemanager_folder' else attributes.get('project_id') if resource['type'] == 'stackit_resourcemanager_project' else attributes.get('id')
            if resource['type'] in ('stackit_resourcemanager_folder', 'stackit_resourcemanager_project'):
                require(isinstance(identifier, str) and 0 < len(identifier) <= 256, 'missing_cloud_resource_identity')
            resources.append({'address': indexed, 'type': resource['type'], 'id': identifier})
    require(len({r['address'] for r in resources}) == len(resources), 'duplicate_resource_address')
    return {'schemaVersion': 1, 'lineage': state['lineage'], 'serial': state['serial'],
            'resources': sorted(resources, key=lambda r: r['address'])}


def verify_state(state, captured):
    current = inventory(state)
    require(current['lineage'] == captured.get('lineage'), 'state_lineage_changed')
    require(current['serial'] >= captured.get('serial', -1), 'state_serial_regressed')
    expected = {r['address']: r for r in captured.get('resources', [])}
    for resource in current['resources']:
        require(expected.get(resource['address']) == resource, 'unreviewed_or_changed_state_resource')
    return {'lineageMatches': True, 'resourceCount': len(current['resources'])}


def check_plan(plan, captured, phase):
    require(isinstance(plan.get('format_version'), str) and plan['format_version'].startswith('1.'), 'unsupported_plan_format')
    require(phase in ('remove_projects', 'finalize_folders'), 'unsupported_phase')
    require(captured.get('schemaVersion') == 1 and isinstance(captured.get('resources'), list), 'invalid_inventory')
    require(plan.get('errored', False) is False and plan.get('complete', True) is True,
            'incomplete_plan')
    expected = {r['address']: r for r in captured['resources']}
    require(len(expected) == len(captured['resources']), 'duplicate_inventory_address')
    for drift in plan.get('resource_drift', []):
        require(not (drift.get('mode') == 'managed' and drift.get('address') in expected
                     and drift.get('change', {}).get('actions') == ['delete']),
                'resource_disappeared_during_refresh_requires_authorized_review')
    deleted = []
    for change in plan.get('resource_changes', []):
        if change.get('mode') == 'data':
            require(change['change']['actions'] in [['read'], ['no-op']], 'unexpected_data_change')
            continue
        address = change['address']
        actions = change['change']['actions']
        require(actions in [['delete'], ['no-op']], 'retirement_requires_delete_only_plan')
        require(address in expected, 'unreviewed_resource')
        original = expected[address]
        require(change['type'] == original['type'], 'resource_type_changed')
        before = change['change'].get('before') or {}
        identifier = before.get('folder_id') if original['type'] == 'stackit_resourcemanager_folder' else before.get('project_id') if original['type'] == 'stackit_resourcemanager_project' else before.get('id')
        require(identifier == original['id'], 'resource_identity_changed')
        governance = address.startswith('module.governance.')
        if actions == ['no-op']:
            require(phase != 'finalize_folders' or governance, 'non_governance_resource_still_present')
            continue
        if phase == 'remove_projects':
            require(not governance, 'governance_must_remain_during_project_removal')
        else:
            require(governance and original['type'] in (
                'stackit_resourcemanager_folder', 'stackit_authorization_folder_role_assignment'),
                'finalization_may_only_delete_captured_folders_and_folder_assignments')
        deleted.append(address)
    require(not plan.get('deferred_changes'), 'deferred_plan')
    return {'phase': phase, 'deleteCount': len(deleted), 'planSha256': hashlib.sha256(
        json.dumps(plan, sort_keys=True, separators=(',', ':')).encode()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    snapshot = sub.add_parser('inventory')
    snapshot.add_argument('--state', required=True)
    snapshot.add_argument('--out', required=True)
    verify = sub.add_parser('verify-state')
    verify.add_argument('--state', required=True)
    verify.add_argument('--inventory', required=True)
    check = sub.add_parser('check-plan')
    check.add_argument('--state', required=True)
    check.add_argument('--inventory', required=True)
    check.add_argument('--plan', required=True)
    check.add_argument('--phase', choices=['remove_projects', 'finalize_folders'], required=True)
    args = parser.parse_args()
    if args.command == 'inventory':
        with open(args.state, encoding='utf-8') as source:
            result = inventory(json.load(source))
        fd = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as target:
            json.dump(result, target, indent=2)
            target.write('\n')
        print(json.dumps({'resourceCount': len(result['resources'])}))
    else:
        with open(args.inventory, encoding='utf-8') as source:
            captured = json.load(source)
        with open(args.state, encoding='utf-8') as source:
            current = json.load(source)
        verified = verify_state(current, captured)
        if args.command == 'verify-state':
            print(json.dumps(verified))
        else:
            with open(args.plan, encoding='utf-8') as source:
                plan = json.load(source)
            print(json.dumps(check_plan(plan, captured, args.phase)))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError):
        # JSON/State may contain credentials. Never include parser text or input.
        print('Retirement validation failed; inspect the private input locally.', file=sys.stderr)
        sys.exit(1)
