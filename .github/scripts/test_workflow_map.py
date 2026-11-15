"""Contract tests for workflow coverage, source drift and bilingual rendering."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('workflow_map', Path(__file__).with_name('workflow-map.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class WorkflowMapTests(unittest.TestCase):
    def setUp(self):
        self.sources = m.load_sources(m.ROOT)
        self.rows = json.loads((m.ROOT / 'docs/workflow-map.json').read_text())['workflows']

    def test_yaml_on_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '.github/workflows').mkdir(parents=True)
            (root / '.github/workflows/test.yml').write_text('name: Test\non:\n  workflow_dispatch:\njobs: {}\n')
            self.assertIn('on', m.load_sources(root)['test.yml'])

    def test_new_workflow_requires_mapping(self):
        self.sources['new.yml'] = copy.deepcopy(next(iter(self.sources.values())))
        with self.assertRaisesRegex(ValueError, 'inventory changed'):
            m.validate(self.rows, self.sources)

    def test_new_job_requires_mapping(self):
        self.sources[self.rows[0]['file']]['jobs']['new'] = {'runs-on': 'ubuntu-latest'}
        with self.assertRaisesRegex(ValueError, 'Unmapped'):
            m.validate(self.rows, self.sources)

    def test_deployment_lane_matches_target(self):
        next(row for row in self.rows if row['file'] == 'configurator-production.yml')['lane'] = 'dev'
        with self.assertRaisesRegex(ValueError, 'lane disagrees'):
            m.validate(self.rows, self.sources)

    def test_missing_translation_is_rejected(self):
        next(iter(self.rows[0]['phases'].values())).pop('de')
        with self.assertRaisesRegex(ValueError, 'Missing translation'):
            m.validate(self.rows, self.sources)

    def test_trigger_change_invalidates_signature(self):
        before = m.signature(self.sources)
        self.sources['validate.yml']['on']['schedule'] = [{'cron': '0 0 * * *'}]
        self.assertNotEqual(before, m.signature(self.sources))

    def test_action_pin_only_does_not_invalidate_signature(self):
        before = m.signature(self.sources)
        job = next(job for job in self.sources['validate.yml']['jobs'].values() if job.get('steps'))
        job['steps'][0]['uses'] = 'actions/checkout@new-pin'
        self.assertEqual(before, m.signature(self.sources))

    def test_current_bilingual_render_covers_all_workflows(self):
        m.validate(self.rows, self.sources)
        for language in ('en', 'de'):
            svg = ET.fromstring(m.render(self.rows, self.sources, language))
            rows = [element for element in svg.iter() if 'aria-label' in element.attrib]
            self.assertEqual(len(self.sources), len(rows))
            inventory = m.inventory(self.rows, self.sources, language)
            for name in self.sources:
                self.assertIn('../.github/workflows/' + name, inventory)


if __name__ == '__main__':
    unittest.main()
