"""Offline model/thinking regressions; only isolated temporary data is touched."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import APIError, Studio


FIXTURE = {
    'version': 1, 'modules': [{'id': 'c', 'title': 'C'}], 'resources': [],
    'lessons': [{'id': 'lesson1', 'title': 'First C', 'available': True,
                 'exerciseIds': ['quiz1'], 'objectives': ['Print'],
                 'sections': [{'title': 'C', 'body': 'Learn C.'}], 'takeaway': 'Practice.'}],
    'exercises': [{'id': 'quiz1', 'lessonId': 'lesson1', 'type': 'quiz',
                   'title': 'Quiz', 'prompt': '?', 'choices': ['a', 'b'],
                   'answer': 1, 'explanation': 'b', 'hints': ['Hint']}],
}
CURRENT_MODELS = ('deepseek-flash', 'deepseek-v4-pro')
KNOWN_MODELS = CURRENT_MODELS + ('deepseek-chat', 'deepseek-reasoner')
ANSWER = {
    'choices': [{'message': {'content': 'Start with a variable.'}, 'finish_reason': 'stop'}],
    'usage': {'prompt_tokens': 17, 'completion_tokens': 9},
}


class MemoryKeyStore:
    """A credential stand-in with no file, DPAPI, or environment access."""
    def __init__(self):
        self.present = True
        self.writes = []
        self.clears = 0

    def has_key(self):
        return self.present

    def read(self):
        return 'OFFLINE_TEST_ONLY_NO_PROVIDER_ACCESS' if self.present else ''

    def write(self, value):
        self.writes.append(value)
        self.present = True

    def clear(self):
        self.clears += 1
        self.present = False


class ReasoningCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='reasoning-test-', dir=ROOT / 'tests')
        self.root = Path(self.temporary.name)
        (self.root / 'content').mkdir()
        (self.root / 'content' / 'curriculum.json').write_text(json.dumps(FIXTURE), encoding='utf-8')
        with patch.object(Studio, 'inspect_environment', return_value={}):
            self.app = Studio(self.root, self.root / 'isolated-data')
        self.app.key_store = MemoryKeyStore()
        self.network_guard = patch.object(self.app, 'api_request', side_effect=AssertionError('Unexpected API request'))
        self.network_guard.start()
        self.addCleanup(self.network_guard.stop)
        self.addCleanup(self.temporary.cleanup)

    def assert_error(self, status, callback):
        with self.assertRaises(APIError) as raised:
            callback()
        self.assertEqual(raised.exception.status, status)
        return raised.exception

    def configure(self, model='deepseek-flash', mode='enabled', effort='high'):
        return self.app.update_settings({'model': model, 'thinkingMode': mode,
                                         'reasoningEffort': effort, 'aiEnabled': True})

    def model_list(self, records):
        with patch.object(self.app, 'api_request', return_value={'data': records}) as request:
            response = self.app.models()
        request.assert_called_once_with('/models')
        return {item['id']: item for item in response['models']}

    def chat(self, answer=None, **body):
        with patch.object(self.app, 'api_request', return_value=copy.deepcopy(ANSWER if answer is None else answer)) as request:
            response = self.app.chat({'message': 'Please explain.', 'lessonId': 'lesson1',
                                      'includeCode': False, **body})
        self.assertEqual(request.call_count, 1)
        self.assertEqual(request.call_args.args[0], '/chat/completions')
        return response, request.call_args.args[1]

    def write_raw_state(self, state):
        with self.app.connect() as connection:
            connection.execute('UPDATE app_state SET payload=? WHERE id=1', (json.dumps(state),))

    def test_defaults_and_old_sqlite_read_preserve_learning_and_ai_switch(self):
        current = self.app.state()
        self.assertEqual(current['settings']['thinkingMode'], 'enabled')
        self.assertEqual(current['settings']['reasoningEffort'], 'high')
        self.configure()
        old = self.app.state()
        old['notes']['lesson1'] = 'Keep this existing note.'
        old['settings'].pop('thinkingMode')
        old['settings'].pop('reasoningEffort')
        self.write_raw_state(old)
        migrated = self.app.state()
        self.assertEqual(migrated['settings']['thinkingMode'], 'enabled')
        self.assertEqual(migrated['settings']['reasoningEffort'], 'high')
        self.assertTrue(migrated['settings']['aiEnabled'])
        expected = copy.deepcopy(old)
        expected['settings'].update(thinkingMode='enabled', reasoningEffort='high')
        self.assertEqual(migrated, expected)

    def test_old_sqlite_transaction_backfills_without_resetting_settings(self):
        self.configure()
        old = self.app.state()
        old['settings'].pop('thinkingMode')
        old['settings'].pop('reasoningEffort')
        self.write_raw_state(old)
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'A new note'})
        with self.app.connect() as connection:
            stored = json.loads(connection.execute('SELECT payload FROM app_state WHERE id=1').fetchone()[0])
        self.assertEqual(stored['settings']['thinkingMode'], 'enabled')
        self.assertEqual(stored['settings']['reasoningEffort'], 'high')
        self.assertTrue(stored['settings']['aiEnabled'])
        self.assertFalse(stored['settings']['hasApiKey'])
        self.assertEqual(stored['notes']['lesson1'], 'A new note')

    def test_legacy_v1_backup_import_backfills_and_preserves_recovery_copy(self):
        self.configure()
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Original note'})
        backup = self.app.export()
        self.assertEqual(backup['version'], 1)
        backup['state']['settings'].pop('thinkingMode')
        backup['state']['settings'].pop('reasoningEffort')
        backup['state']['notes']['lesson1'] = 'Imported legacy note'
        response = self.app.post('/api/import', {'backup': backup})
        settings = response['state']['settings']
        self.assertEqual(settings['thinkingMode'], 'enabled')
        self.assertEqual(settings['reasoningEffort'], 'high')
        self.assertFalse(settings['aiEnabled'])
        self.assertTrue(settings['hasApiKey'])
        self.assertEqual(response['state']['notes']['lesson1'], 'Imported legacy note')
        copies = list((self.app.data / 'backups').glob('*.json'))
        self.assertEqual(len(copies), 1)
        recovery = json.loads(copies[0].read_text(encoding='utf-8'))
        self.assertEqual(recovery['state']['notes']['lesson1'], 'Original note')
        self.assertNotIn(self.app.key_store.read(), json.dumps(recovery))

    def test_new_settings_survive_export_import_and_invalid_import_is_atomic(self):
        self.configure(model='deepseek-v4-pro', effort='max')
        backup = self.app.export()
        self.app.post('/api/import', {'backup': backup})
        settings = self.app.state()['settings']
        self.assertEqual(settings['model'], 'deepseek-v4-pro')
        self.assertEqual(settings['thinkingMode'], 'enabled')
        self.assertEqual(settings['reasoningEffort'], 'max')
        for field, bad in (('thinkingMode', 'automatic'), ('reasoningEffort', 'medium')):
            with self.subTest(field=field):
                broken = copy.deepcopy(backup)
                broken['state']['settings'][field] = bad
                before = self.app.state()
                copies = list((self.app.data / 'backups').glob('*.json'))
                self.assert_error(400, lambda: self.app.post('/api/import', {'backup': broken}))
                self.assertEqual(self.app.state(), before)
                self.assertEqual(list((self.app.data / 'backups').glob('*.json')), copies)

    def test_known_models_fallback_and_sanitized_official_metadata(self):
        records = [{'id': model} for model in KNOWN_MODELS]
        records[0].update(name='DeepSeek Flash', max_output_tokens=8192, private_field='discard')
        models = self.model_list(records + [{'id': '../bad'}, {'id': 23}, None])
        self.assertEqual(set(models), set(KNOWN_MODELS))
        for model in KNOWN_MODELS:
            self.assertTrue(models[model]['thinkingSupported'])
            self.assertEqual(set(models[model]['effort']['supported_levels']), {'low', 'high', 'max'})
            self.assertEqual(models[model]['effort']['default_level'], 'high')
        self.assertEqual(models['deepseek-flash']['name'], 'DeepSeek Flash')
        self.assertEqual(models['deepseek-flash']['max_output_tokens'], 8192)
        self.assertNotIn('private_field', models['deepseek-flash'])

    def test_unknown_and_malformed_metadata_do_not_invent_thinking_support(self):
        models = self.model_list([
            {'id': 'future-plain', 'name': {'invalid': True}, 'max_output_tokens': True},
            {'id': 'future-thinking', 'effort': {'supported_levels': ['low', 'high'], 'default_level': 'high'}},
            {'id': 'deepseek-flash', 'effort': {'supported_levels': ['medium'], 'default_level': 'medium'}},
            {'id': 'deepseek-v4-pro', 'effort': None},
        ])
        self.assertFalse(models['future-plain']['thinkingSupported'])
        self.assertFalse(models['deepseek-flash']['thinkingSupported'])
        self.assertFalse(models['deepseek-v4-pro']['thinkingSupported'])
        self.assertTrue(models['future-thinking']['thinkingSupported'])
        self.assertEqual(set(models['future-thinking']['effort']['supported_levels']), {'low', 'high'})
        self.assertIsInstance(models['future-plain'].get('name', ''), str)
        self.assertNotIsInstance(models['future-plain'].get('max_output_tokens'), bool)

    def test_current_models_send_all_three_efforts_and_disabled_mode(self):
        for model in CURRENT_MODELS:
            for effort, budget in (('low', 4096), ('high', 8192), ('max', 16384)):
                with self.subTest(model=model, effort=effort):
                    self.configure(model=model, effort=effort)
                    response, payload = self.chat()
                    self.assertEqual(payload['model'], model)
                    self.assertEqual(payload['thinking'], {'type': 'enabled'})
                    self.assertEqual(payload['reasoning_effort'], effort)
                    self.assertEqual(payload['max_tokens'], budget)
                    self.assertEqual(response['requestSettings']['model'], model)
                    self.assertEqual(response['requestSettings']['thinkingMode'], 'enabled')
                    self.assertEqual(response['requestSettings']['reasoningEffort'], effort)
            with self.subTest(model=model, mode='disabled'):
                self.configure(model=model, mode='disabled', effort='max')
                response, payload = self.chat()
                self.assertEqual(payload['thinking'], {'type': 'disabled'})
                self.assertNotIn('reasoning_effort', payload)
                self.assertEqual(payload['max_tokens'], 2048)
                self.assertEqual(response['requestSettings']['thinkingMode'], 'disabled')

    def test_unknown_model_requires_disabled_mode_and_omits_thinking_parameters(self):
        before = self.app.state()
        self.assert_error(400, lambda: self.configure(model='future-plain'))
        self.assertEqual(self.app.state(), before)
        self.configure(model='future-plain', mode='disabled')
        _, payload = self.chat()
        self.assertEqual(payload['model'], 'future-plain')
        self.assertNotIn('thinking', payload)
        self.assertNotIn('reasoning_effort', payload)
        self.assertEqual(payload['max_tokens'], 2048)

    def test_unknown_model_with_verified_metadata_can_send_supported_effort(self):
        self.model_list([{'id': 'future-thinking',
                          'effort': {'supported_levels': ['low', 'high'], 'default_level': 'high'}}])
        self.configure(model='future-thinking', effort='low')
        _, payload = self.chat()
        self.assertEqual(payload['model'], 'future-thinking')
        self.assertEqual(payload['thinking'], {'type': 'enabled'})
        self.assertEqual(payload['reasoning_effort'], 'low')

    def test_legacy_unknown_model_does_not_block_daily_goal_or_key_removal(self):
        old = self.app.state()
        old['settings'].update(model='legacy-model', aiEnabled=True)
        old['settings'].pop('thinkingMode')
        old['settings'].pop('reasoningEffort')
        self.write_raw_state(old)
        response = self.app.update_settings({'dailyMinutes': 60})
        self.assertEqual(response['state']['settings']['dailyMinutes'], 60)
        self.assertEqual(response['state']['settings']['model'], 'legacy-model')
        self.app.update_settings({'clearApiKey': True})
        self.assertFalse(self.app.state()['settings']['aiEnabled'])
        self.assertFalse(self.app.state()['settings']['hasApiKey'])

    def test_model_cache_limits_effort_and_maximum_output_budget(self):
        self.model_list([{'id': 'deepseek-flash', 'max_output_tokens': 5000,
                          'effort': {'supported_levels': ['high'], 'default_level': 'high'}}])
        self.configure()
        _, payload = self.chat()
        self.assertEqual(payload['reasoning_effort'], 'high')
        self.assertEqual(payload['max_tokens'], 5000)
        before = self.app.state()
        self.assert_error(400, lambda: self.app.update_settings({'reasoningEffort': 'max'}))
        self.assertEqual(self.app.state(), before)

    def test_invalid_settings_and_merged_combinations_do_not_mutate_state_or_key(self):
        self.configure(effort='max')
        self.model_list([{'id': 'future-high-only', 'effort': {'supported_levels': ['high'], 'default_level': 'high'}}])
        invalid = [{'model': 'future-high-only'}, {'model': 'future-plain', 'thinkingMode': 'enabled'}]
        invalid += [{'thinkingMode': value} for value in (None, True, [], 'automatic', '')]
        invalid += [{'reasoningEffort': value} for value in (None, False, 0, [], 'medium', '')]
        for updates in invalid:
            with self.subTest(updates=updates):
                before = self.app.state()
                for credential_change in ({'apiKey': 'OFFLINE_REPLACEMENT_CREDENTIAL'}, {'clearApiKey': True}):
                    self.assert_error(400, lambda: self.app.update_settings({**updates, **credential_change}))
                    self.assertEqual(self.app.state(), before)
                    self.assertEqual(self.app.key_store.writes, [])
                    self.assertEqual(self.app.key_store.clears, 0)

    def test_chat_owns_lock_before_reading_state_and_blocks_settings_changes(self):
        self.configure()
        original_state = self.app.state
        lock_at_reads = []
        def observe_state():
            lock_at_reads.append(self.app.chat_lock.locked())
            return original_state()
        def fake_api(path, payload=None):
            self.assertEqual(path, '/chat/completions')
            before = original_state()
            self.assert_error(409, lambda: self.app.update_settings({'model': 'deepseek-v4-pro', 'clearApiKey': True}))
            self.assert_error(429, lambda: self.app.chat({'message': 'Second request', 'includeCode': False}))
            self.assertEqual(original_state(), before)
            self.assertEqual(self.app.key_store.clears, 0)
            return copy.deepcopy(ANSWER)
        with patch.object(self.app, 'state', side_effect=observe_state), patch.object(self.app, 'api_request', side_effect=fake_api):
            self.app.chat({'message': 'Please explain.', 'includeCode': False})
        self.assertTrue(lock_at_reads)
        self.assertTrue(all(lock_at_reads))
        self.assertFalse(self.app.chat_lock.locked())
        self.app.update_settings({'reasoningEffort': 'low'})
        self.assertEqual(self.app.state()['settings']['reasoningEffort'], 'low')

    def test_failed_api_or_malformed_reply_preserves_all_learning_state(self):
        self.configure(effort='max')
        before = self.app.state()
        for result in (APIError('Offline network failure', 502), {'choices': [{'message': 'broken'}]},
                       {'choices': [{'message': {'content': ''}, 'finish_reason': 'stop'}]}):
            with self.subTest(result=type(result).__name__):
                kwargs = {'side_effect': result} if isinstance(result, Exception) else {'return_value': result}
                with patch.object(self.app, 'api_request', **kwargs):
                    self.assert_error(502, lambda: self.app.chat({'message': 'Help', 'lessonId': 'lesson1',
                                                                 'exerciseId': 'quiz1', 'includeCode': False}))
                self.assertEqual(self.app.state(), before)
                self.assertFalse(self.app.chat_lock.locked())

    def test_length_with_content_saves_reply_and_exposes_warning(self):
        self.configure()
        truncated = copy.deepcopy(ANSWER)
        truncated['choices'][0]['finish_reason'] = 'length'
        response, _ = self.chat(truncated)
        self.assertTrue(response.get('warning'))
        self.assertEqual(response['reply'], ANSWER['choices'][0]['message']['content'])
        self.assertEqual(len(self.app.state()['chats']), 2)
        self.assertEqual(self.app.state()['usage'], {'requests': 1, 'inputTokens': 17, 'outputTokens': 9})

    def test_chat_model_identity_and_truncation_warning_survive_backup_roundtrip(self):
        self.configure(model='deepseek-v4-pro', effort='max')
        truncated = copy.deepcopy(ANSWER)
        truncated['choices'][0]['finish_reason'] = 'length'
        response, _ = self.chat(truncated)
        original = copy.deepcopy(self.app.state()['chats'])
        self.assertEqual(original[-1]['requestSettings'], response['requestSettings'])
        self.assertEqual(original[-1]['warning'], response['warning'])
        backup = self.app.export()
        imported = self.app.post('/api/import', {'backup': backup})
        self.assertEqual(imported['state']['chats'], original)
        broken = copy.deepcopy(backup)
        broken['state']['chats'][-1]['requestSettings']['reasoningEffort'] = 'invalid'
        before = self.app.state()
        self.assert_error(400, lambda: self.app.post('/api/import', {'backup': broken}))
        self.assertEqual(self.app.state(), before)

    def test_length_without_content_counts_usage_without_chat_or_assistance(self):
        self.configure()
        empty = copy.deepcopy(ANSWER)
        empty['choices'][0].update(message={'content': '', 'reasoning_content': 'Unfinished internal reasoning'}, finish_reason='length')
        before = self.app.state()
        with patch.object(self.app, 'api_request', return_value=empty):
            error = self.assert_error(502, lambda: self.app.chat({'message': 'Help', 'lessonId': 'lesson1',
                                                                 'exerciseId': 'quiz1', 'includeCode': False}))
        self.assertRegex(str(error), r'(?i)(上限|输出|limit|token)')
        after = self.app.state()
        self.assertEqual(after['usage'], {'requests': 1, 'inputTokens': 17, 'outputTokens': 9})
        after['usage'] = before['usage']
        self.assertEqual(after, before)
        self.assertFalse(self.app.chat_lock.locked())


if __name__ == '__main__':
    unittest.main(verbosity=2)
