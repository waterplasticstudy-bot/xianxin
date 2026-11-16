"""Isolated, offline regression tests. No real API key or paid API request is used."""
import copy
import http.client
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import APIError, Studio, StudioHTTPServer
from backend.runtime import child_environment, run_bounded
from backend.instance import data_directory_lock


FIXTURE = {'version': 1, 'modules': [{'id': 'c', 'title': 'C'}], 'resources': [],
           'lessons': [{'id': 'lesson1', 'title': 'First C', 'available': True, 'exerciseIds': ['quiz1', 'code1'],
                        'objectives': ['Print'], 'sections': [{'title': 'C', 'body': 'Learn C.'}], 'takeaway': 'Practice.'}],
           'exercises': [
               {'id': 'quiz1', 'lessonId': 'lesson1', 'type': 'quiz', 'title': 'Quiz', 'prompt': '?',
                'choices': ['a', 'b'], 'answer': 1, 'explanation': 'b', 'hints': ['Hint']},
               {'id': 'code1', 'lessonId': 'lesson1', 'type': 'code', 'title': 'Add', 'prompt': 'Add two numbers.',
                'starter': '', 'tests': [{'input': '2 3\n', 'expected': '5\n'}, {'input': '-7 2\n', 'expected': '-5\n'}], 'hints': []}]}
SOLUTION = '#include <stdio.h>\nint main(void){int a,b;if(scanf("%d%d",&a,&b)!=2)return 1;printf("%d\\n",a+b);return 0;}'


class StudioCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='backend-test-', dir=ROOT / 'tests')
        self.root = Path(self.temporary.name)
        (self.root / 'content').mkdir(); (self.root / 'static').mkdir()
        (self.root / 'content' / 'curriculum.json').write_text(json.dumps(FIXTURE), encoding='utf-8')
        (self.root / 'static' / 'index.html').write_text('<!doctype html><title>Test</title>', encoding='utf-8')
        self.app = Studio(self.root, self.root / 'isolated-data')

    def tearDown(self):
        self.temporary.cleanup()

    def assert_error(self, status, callback):
        with self.assertRaises(APIError) as raised:
            callback()
        self.assertEqual(raised.exception.status, status)

    def test_empty_state_and_missing_api(self):
        self.assertEqual(self.app.state()['sessions'], [])
        self.assertFalse(self.app.state()['settings']['hasApiKey'])
        self.assertEqual(self.app.state()['settings']['model'], '')
        self.assert_error(409, self.app.models)
        self.assert_error(409, lambda: self.app.chat({'message': 'Help', 'includeCode': False}))
        self.assertEqual(self.app.state()['usage']['requests'], 0)

    def test_progress_requires_real_passes_and_assistance_persists(self):
        self.assert_error(409, lambda: self.app.post('/api/progress', {'lessonId': 'lesson1', 'status': 'completed'}))
        wrong = self.app.post('/api/quiz', {'exerciseId': 'quiz1', 'answer': 0})
        self.assertFalse(wrong['correct'])
        self.app.post('/api/hint', {'exerciseId': 'quiz1'})
        correct = self.app.post('/api/quiz', {'exerciseId': 'quiz1', 'answer': 1, 'assisted': False})
        progress = correct['state']['progress']['lesson1']
        self.assertTrue(progress['assisted'])
        self.assertEqual(progress['passedExercises'], ['quiz1'])
        self.assertEqual(progress['independentExercises'], [])
        self.assertTrue(correct['state']['attempts'][-1]['assisted'])
        self.assertEqual(progress['status'], 'learning')

    def test_session_idempotence_and_atomic_parallel_writes(self):
        errors = []
        def write():
            try:
                self.app.post('/api/session', {'lessonId': 'lesson1', 'seconds': 30, 'id': 'same-id'})
            except Exception as error:
                errors.append(error)
        threads = [threading.Thread(target=write) for _ in range(12)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertFalse(errors)
        self.assertEqual(len(self.app.state()['sessions']), 1)
        self.assertEqual(self.app.state()['sessions'][0]['seconds'], 30)
        self.assert_error(409, lambda: self.app.post('/api/session', {'lessonId': 'lesson1', 'seconds': 60, 'id': 'same-id'}))
        self.assert_error(400, lambda: self.app.post('/api/session', {'lessonId': 'lesson1', 'seconds': True, 'id': 'bad'}))

    def test_delayed_session_uses_original_taipei_date(self):
        payload = {'lessonId': 'lesson1', 'seconds': 30, 'id': 'delayed-event', 'occurredAt': '2026-01-01T17:30:00Z'}
        self.app.post('/api/session', payload)
        self.app.post('/api/session', payload)
        record = self.app.state()['sessions'][0]
        self.assertEqual(record['date'], '2026-01-02')
        self.assertEqual(record['createdAt'], '2026-01-02T01:30:00+08:00')
        self.assertEqual(len(self.app.state()['sessions']), 1)
        self.assert_error(400, lambda: self.app.post('/api/session', {**payload, 'id':'future', 'occurredAt':'2099-01-01T00:00:00Z'}))

    def test_import_validates_and_backs_up_transactionally(self):
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Original note'})
        backup = self.app.export()
        backup['state']['notes']['lesson1'] = 'Imported note'
        backup['state']['settings']['aiEnabled'] = True
        self.app.post('/api/import', {'backup': backup})
        self.assertEqual(self.app.state()['notes']['lesson1'], 'Imported note')
        self.assertFalse(self.app.state()['settings']['aiEnabled'])
        saved = list((self.app.data / 'backups').glob('*.json'))
        self.assertEqual(len(saved), 1)
        self.assertEqual(json.loads(saved[0].read_text(encoding='utf-8'))['state']['notes']['lesson1'], 'Original note')
        broken = copy.deepcopy(backup)
        broken['state']['notes']['unknown'] = 'Bad'
        self.assert_error(400, lambda: self.app.post('/api/import', {'backup': broken}))
        self.assertEqual(self.app.state()['notes']['lesson1'], 'Imported note')
        self.assertEqual(len(list((self.app.data / 'backups').glob('*.json'))), 1)
        self.app.run_lock.acquire()
        try:
            self.assert_error(409, lambda: self.app.post('/api/import', {'backup': backup}))
        finally:
            self.app.run_lock.release()

    def test_import_rejects_forged_independent_progress(self):
        self.app.post('/api/hint', {'exerciseId': 'quiz1'})
        self.app.post('/api/quiz', {'exerciseId': 'quiz1', 'answer': 1})
        backup = self.app.export()
        backup['state']['progress']['lesson1']['independentExercises'] = ['quiz1']
        self.assert_error(400, lambda: self.app.import_state(backup))
        backup = self.app.export()
        backup['state']['settings']['apiKey'] = 'not-allowed'
        self.assert_error(400, lambda: self.app.import_state(backup))

    def test_reset_preserves_configuration_and_key_and_creates_recovery_backup(self):
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Restore this note'})
        self.app.post('/api/draft', {'exerciseId': 'code1', 'code': SOLUTION})
        self.app.post('/api/quiz', {'exerciseId': 'quiz1', 'answer': 1})
        self.app.post('/api/session', {'lessonId': 'lesson1', 'seconds': 40, 'id': 'reset-session'})
        self.app.post('/api/report', {'date': '2026-01-01', 'note': 'Daily reflection'})
        with self.app.transaction() as state:
            state['settings'].update(dailyMinutes=80, model='deepseek-chat', thinkingMode='disabled', reasoningEffort='max', aiEnabled=True)
            state['usage'].update(requests=2, inputTokens=30, outputTokens=40)
            state['chats'].append({'id': 'reset-chat', 'role': 'user', 'content': 'Question', 'lessonId': None,
                                   'createdAt': '2026-01-01T00:00:00+08:00'})
        # A fake encrypted file tests preservation without decrypting any credential.
        self.app.key_store.path.write_bytes(b'FAKE_ENCRYPTED_DATA_FOR_OFFLINE_RESET_TEST')
        old = self.app.export()
        with patch.object(self.app.key_store, 'read', side_effect=AssertionError('Reset must not decrypt a key')):
            response = self.app.post('/api/reset', {'confirmation': 'RESET'})
        self.assertTrue(response['backupCreated'])
        state = response['state']
        self.assertEqual(state['settings'], {'dailyMinutes': 80, 'model': 'deepseek-chat', 'thinkingMode': 'disabled',
                                             'reasoningEffort': 'max', 'aiEnabled': False, 'hasApiKey': True})
        for name in ('progress', 'drafts', 'notes', 'reports'):
            self.assertEqual(state[name], {})
        for name in ('sessions', 'attempts', 'chats'):
            self.assertEqual(state[name], [])
        self.assertEqual(state['usage'], {'requests': 0, 'inputTokens': 0, 'outputTokens': 0})
        self.assertEqual(self.app.key_store.path.read_bytes(), b'FAKE_ENCRYPTED_DATA_FOR_OFFLINE_RESET_TEST')
        saved = list((self.app.data / 'backups').glob('*before-reset*.json'))
        self.assertEqual(len(saved), 1)
        recovery = json.loads(saved[0].read_text(encoding='utf-8'))
        self.assertEqual(recovery['state'], old['state'])
        self.assertNotIn('FAKE_ENCRYPTED', saved[0].read_text(encoding='utf-8'))
        self.app.post('/api/import', {'backup': recovery})
        self.assertEqual(self.app.export()['state'], old['state'])

    def test_reset_rejects_missing_confirmation_and_active_work(self):
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Do not lose me'})
        before = self.app.state()
        for body in ({}, {'confirmation': 'reset'}, {'confirmation': True}, {'confirmation': 'RESET', 'unexpected': 1}):
            self.assert_error(400, lambda: self.app.post('/api/reset', body))
        for lock in (self.app.run_lock, self.app.chat_lock):
            with lock:
                self.assert_error(409, lambda: self.app.post('/api/reset', {'confirmation': 'RESET'}))
                self.assert_error(409, lambda: self.app.import_state(self.app.export()))
            self.assertFalse(self.app.run_lock.locked())
            self.assertFalse(self.app.chat_lock.locked())
        self.assertEqual(self.app.state(), before)
        self.assertEqual(list((self.app.data / 'backups').iterdir()), [])

    def test_reset_and_import_backup_failures_leave_original_state(self):
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Keep this on failure'})
        before = self.app.state()
        incoming = self.app.export()
        incoming['state']['notes']['lesson1'] = 'Imported'
        callbacks = [lambda: self.app.post('/api/reset', {'confirmation': 'RESET'}),
                     lambda: self.app.post('/api/import', {'backup': incoming})]
        for callback in callbacks:
            for target in ('server.os.fsync', 'server.os.replace'):
                with self.subTest(operation=target), patch(target, side_effect=OSError('Injected disk failure')):
                    self.assert_error(503, callback)
                self.assertEqual(self.app.state(), before)
            with patch.object(Path, 'read_bytes', return_value=b'Injected corrupt readback'):
                self.assert_error(503, callback)
            self.assertEqual(self.app.state(), before)
            self.assertFalse(self.app.run_lock.locked())
            self.assertFalse(self.app.chat_lock.locked())

    def test_reset_sqlite_failure_rolls_back_and_leaves_verified_backup(self):
        self.app.post('/api/note', {'lessonId': 'lesson1', 'text': 'Survives database failure'})
        before = self.app.state()
        with self.app.connect() as connection:
            connection.execute("CREATE TRIGGER reject_update BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT, 'Injected database failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.app.post('/api/reset', {'confirmation': 'RESET'})
        self.assertEqual(self.app.state(), before)
        copies = list((self.app.data / 'backups').glob('*.json'))
        self.assertEqual(len(copies), 1)
        self.assertEqual(json.loads(copies[0].read_text(encoding='utf-8'))['state']['notes'], before['notes'])
        self.assertFalse(self.app.run_lock.locked())
        self.assertFalse(self.app.chat_lock.locked())

    def test_replacement_holds_locks_until_state_commit(self):
        saved = threading.Event()
        release = threading.Event()
        errors = []
        original = self.app.save_backup
        def delayed_backup(state, reason):
            result = original(state, reason)
            saved.set()
            if not release.wait(5):
                raise AssertionError('Reset test timed out')
            return result
        def reset():
            try:
                self.app.post('/api/reset', {'confirmation': 'RESET'})
            except Exception as error:
                errors.append(error)
        with patch.object(self.app, 'save_backup', side_effect=delayed_backup):
            thread = threading.Thread(target=reset)
            thread.start()
            try:
                self.assertTrue(saved.wait(5))
                self.assertTrue(self.app.run_lock.locked())
                self.assertTrue(self.app.chat_lock.locked())
                self.assert_error(409, lambda: self.app.post('/api/reset', {'confirmation': 'RESET'}))
                self.assert_error(429, lambda: self.app.chat({'message': 'Concurrent chat', 'includeCode': False}))
                self.assert_error(409, lambda: self.app.update_settings({'dailyMinutes': 60}))
            finally:
                release.set()
                thread.join(5)
        self.assertFalse(thread.is_alive())
        self.assertEqual(errors, [])

    def test_data_directory_lease_prevents_second_server_and_releases(self):
        with data_directory_lock(self.app.data):
            with self.assertRaises(OSError):
                with data_directory_lock(self.app.data):
                    self.fail('Second process lease must not succeed')
        with data_directory_lock(self.app.data):
            pass

    def test_server_refuses_non_loopback_bind(self):
        self.assert_error(400, lambda: StudioHTTPServer(('0.0.0.0', 0), self.app))

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI test')
    def test_dpapi_secret_never_enters_state_export_or_children(self):
        key = 'TEST_FAKE_KEY_ONLY_1234567890'
        self.app.post('/api/settings', {'apiKey': key, 'model': 'deepseek-chat', 'aiEnabled': True})
        self.assertEqual(self.app.key_store.read(), key)
        self.assertNotIn(key.encode(), self.app.key_store.path.read_bytes())
        self.assertNotIn(key, json.dumps(self.app.state()))
        exported = self.app.export()
        self.assertNotIn(key, json.dumps(exported))
        self.app.post('/api/import', {'backup': exported})
        self.assertEqual(self.app.key_store.read(), key)
        self.assertTrue(self.app.state()['settings']['hasApiKey'])
        self.assertFalse(self.app.state()['settings']['aiEnabled'])
        with patch.dict(os.environ, {'DEEPSEEK_API_KEY': key, 'OPENAI_API_KEY': key}):
            environment = child_environment(self.app.compiler, self.app.data / 'tmp')
            self.assertNotIn(key, json.dumps(environment))
            self.assertNotIn('DEEPSEEK_API_KEY', environment)
        self.app.post('/api/settings', {'clearApiKey': True})
        self.assertFalse(self.app.state()['settings']['hasApiKey'])

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI test')
    def test_mock_ai_updates_usage_and_help_never_awards_pass(self):
        self.app.post('/api/settings', {'apiKey': 'TEST_FAKE_KEY_ONLY_1234567890', 'model': 'deepseek-chat', 'aiEnabled': True})
        captured = []
        def fake_api(path, payload=None):
            captured.append(payload)
            return {'choices': [{'message': {'content': 'Try adding the two values.'}}], 'usage': {'prompt_tokens': 101, 'completion_tokens': 12}}
        with patch.object(self.app, 'api_request', side_effect=fake_api):
            result = self.app.chat({'message': 'Help me', 'lessonId': 'lesson1', 'exerciseId': 'code1', 'includeCode': False, 'code': 'PRIVATE_UNSELECTED_CODE'})
        self.assertNotIn('PRIVATE_UNSELECTED_CODE', json.dumps(captured))
        self.assertEqual(result['state']['usage'], {'requests': 1, 'inputTokens': 101, 'outputTokens': 12})
        self.assertEqual(result['state']['progress']['lesson1']['passedExercises'], [])
        self.assertTrue(result['state']['attempts'][-1]['assisted'])
        before = self.app.state()
        with patch.object(self.app, 'api_request', side_effect=APIError('Network failed', 502)):
            self.assert_error(502, lambda: self.app.chat({'message': 'Retry', 'includeCode': False}))
        self.assertEqual(self.app.state(), before)
        with patch.object(self.app, 'api_request', return_value={'choices': [{'message': 'broken'}]}):
            self.assert_error(502, lambda: self.app.chat({'message': 'Retry', 'includeCode': False}))

    def test_native_compile_pass_wrong_syntax_and_busy(self):
        if not self.app.environment['compiler']['available']:
            self.skipTest('GCC unavailable')
        self.app.post('/api/quiz', {'exerciseId': 'quiz1', 'answer': 1})
        passed = self.app.post('/api/run', {'exerciseId': 'code1', 'code': SOLUTION})
        self.assertEqual(passed['status'], 'passed', passed['compilerOutput'])
        self.assertEqual(len(passed['tests']), 2)
        self.assertEqual(passed['state']['progress']['lesson1']['status'], 'completed')
        self.assertEqual(passed['state']['progress']['lesson1']['independentExercises'], ['quiz1', 'code1'])
        wrong = self.app.post('/api/run', {'exerciseId': 'code1', 'code': '#include <stdio.h>\nint main(void){puts("99");} '})
        self.assertEqual(wrong['status'], 'wrong_answer')
        error = self.app.post('/api/run', {'exerciseId': 'code1', 'code': 'int main(void){not c here} '})
        self.assertEqual(error['status'], 'compile_error')
        self.app.run_lock.acquire()
        try:
            before = len(self.app.state()['attempts'])
            busy = self.app.post('/api/run', {'exerciseId': 'code1', 'code': SOLUTION})
            self.assertEqual(busy['status'], 'busy')
            self.assertEqual(len(self.app.state()['attempts']), before)
        finally:
            self.app.run_lock.release()
        self.assertEqual(list((self.app.data / 'jobs').iterdir()), [])

    def test_native_timeout_output_cap_and_tool_fault(self):
        if not self.app.environment['compiler']['available']:
            self.skipTest('GCC unavailable')
        timed = self.app.post('/api/run', {'exerciseId': 'code1', 'code': 'int main(void){for(;;){} }'})
        self.assertEqual(timed['status'], 'timeout')
        flooded = self.app.post('/api/run', {'exerciseId': 'code1', 'code': '#include <stdio.h>\nint main(void){for(;;)puts("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");}'})
        self.assertEqual(flooded['status'], 'runtime_error')
        self.assertLessEqual(len(flooded['tests'][0]['actual'].encode()), 65536)
        before = len(self.app.state()['attempts'])
        with patch('server.run_bounded', return_value={'returncode': 1, 'reason': None, 'output': 'gcc: fatal error: cannot execute cc1', 'seconds': 0}):
            self.assert_error(503, lambda: self.app.post('/api/run', {'exerciseId': 'code1', 'code': SOLUTION}))
        self.assertEqual(len(self.app.state()['attempts']), before)

    @unittest.skipUnless(os.name == 'nt', 'Windows process-tree cleanup')
    def test_windows_descendants_and_blocked_stdin_are_stopped(self):
        if not self.app.environment['compiler']['available']:
            self.skipTest('GCC unavailable')
        source = self.root / 'tree.c'
        executable = self.root / 'tree.exe'
        source.write_text(r'''#include <windows.h>
#include <stdio.h>
int main(int argc,char**argv){
 if(argc>1){Sleep(1200);FILE*f=fopen("leaked.txt","w");if(f){fputs("alive",f);fclose(f);}return 0;}
 char file[MAX_PATH],command[2*MAX_PATH];GetModuleFileNameA(NULL,file,MAX_PATH);
 snprintf(command,sizeof command,"\"%s\" child",file);
 STARTUPINFOA si={0}; PROCESS_INFORMATION pi={0};si.cb=sizeof si;
 if(!CreateProcessA(NULL,command,NULL,NULL,FALSE,CREATE_NO_WINDOW,NULL,NULL,&si,&pi))return 2;
 CloseHandle(pi.hThread);CloseHandle(pi.hProcess);Sleep(100);return 0;
}''', encoding='utf-8')
        environment = child_environment(self.app.compiler, self.app.data / 'tmp')
        compiled = run_bounded([self.app.compiler, str(source), '-o', str(executable)], self.root, environment, 12)
        self.assertEqual(compiled['returncode'], 0, compiled['output'])
        result = run_bounded([str(executable)], self.root, environment, 2)
        self.assertEqual(result['returncode'], 0)
        time.sleep(1.3)
        self.assertFalse((self.root / 'leaked.txt').exists())
        result = run_bounded([str(executable), 'child'], self.root, environment, .2, stdin='x' * 60000)
        self.assertEqual(result['reason'], 'timeout')
        self.assertLess(result['seconds'], 2)

    def test_http_token_origin_host_static_and_export(self):
        server = StudioHTTPServer(('127.0.0.1', 0), self.app)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        def request(method, path, body=None, headers=None):
            connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
            values = {'Content-Type': 'application/json', 'X-Local-Token': self.app.token}
            values.update(headers or {})
            connection.request(method, path, json.dumps(body) if body is not None else None, values)
            response = connection.getresponse()
            data = response.read()
            status = response.status
            connection.close()
            return status, data
        try:
            status, raw = request('GET', '/api/bootstrap')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(raw)['csrfToken'], self.app.token)
            self.assertEqual(request('GET', '/api/health')[0], 200)
            self.assertEqual(request('GET', '/')[0], 200)
            self.assertEqual(request('GET', '/%2e%2e/server.py')[0], 403)
            self.assertEqual(request('GET', '/%5c..%5cserver.py')[0], 400)
            self.assertEqual(request('GET', '/api/bootstrap', headers={'Host': 'evil.test'})[0], 403)
            self.assertEqual(request('GET', '/api/bootstrap', headers={'Origin': 'http://evil.test'})[0], 403)
            self.assertEqual(request('POST', '/api/note', {'lessonId': 'lesson1', 'text': 'ok'}, {'X-Local-Token': ''})[0], 403)
            self.assertEqual(request('POST', '/api/note', {'lessonId': 'lesson1', 'text': 'ok'})[0], 200)
            self.assertEqual(request('GET', '/api/export')[0], 200)
            self.assertEqual(request('GET', '/api/models')[0], 409)
            self.assertEqual(request('POST', '/api/quiz', {'exerciseId': 'quiz1', 'answer': True})[0], 400)
            for _ in range(8):
                self.assertEqual(request('POST', '/api/reset', {'confirmation': 'RESET'}, {'X-Local-Token': ''})[0], 403)
            self.assertEqual(request('POST', '/api/reset', {'confirmation': 'RESET'}, {'Host': 'evil.test'})[0], 403)
            self.assertEqual(request('POST', '/api/reset', {'confirmation': 'RESET'}, {'Origin': 'http://evil.test'})[0], 403)
            self.assertEqual(request('POST', '/api/reset', {})[0], 400)
            status, raw = request('POST', '/api/reset', {'confirmation': 'RESET'})
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(raw)['backupCreated'])
            self.assertEqual(json.loads(raw)['state']['notes'], {})
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main(verbosity=2)
