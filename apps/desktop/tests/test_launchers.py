"""Windows launcher acceptance using disposable data and loopback requests only."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'


@unittest.skipUnless(os.name == 'nt' and POWERSHELL.is_file(), 'Windows PowerShell launcher acceptance')
class LauncherCase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='studio launcher test-')
        self.data = Path(self.temporary.name) / 'learning data'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            self.port = listener.getsockname()[1]
        self.url = f'http://127.0.0.1:{self.port}'
        self.environment = dict(os.environ)
        for name in ('STUDIO_PYTHON', 'STUDIO_PORT', 'STUDIO_DATA_DIR'):
            self.environment.pop(name, None)

    def request(self, path, body=None, token=None):
        headers = {'Content-Type': 'application/json', 'Origin': self.url}
        if token:
            headers['X-Local-Token'] = token
        request = urllib.request.Request(self.url + path, headers=headers,
                                         data=None if body is None else json.dumps(body).encode())
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=2) as response:
            return json.load(response)

    def script(self, name, *arguments, environment=None):
        # Windows detached children may inherit pipe handles. Disk capture keeps
        # this harness bounded even when a startup assertion fails.
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            result = subprocess.run([str(POWERSHELL), '-NoProfile', '-ExecutionPolicy', 'Bypass',
                                     '-File', str(ROOT / name), *map(str, arguments)],
                                    stdout=output, stderr=errors, timeout=45,
                                    env=self.environment if environment is None else environment,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            output.seek(0); errors.seek(0)
            result.stdout = output.read().decode(errors='replace')
            result.stderr = errors.read().decode(errors='replace')
            return result

    def tearDown(self):
        # A fallback shutdown also cleans up if an assertion interrupted the scripted stop.
        try:
            health = self.request('/api/health')
            if Path(health.get('dataDir', '')).resolve() == self.data.resolve():
                bootstrap = self.request('/api/bootstrap')
                self.request('/api/shutdown', {}, bootstrap['csrfToken'])
        except (OSError, urllib.error.URLError):
            pass
        deadline = time.monotonic() + 5
        while True:
            try:
                self.temporary.cleanup()
                break
            except PermissionError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.1)

    def test_explicit_start_identity_check_duplicate_data_and_verified_stop(self):
        started = self.script('Start-Studio.ps1', '-NoBrowser', '-PythonPath', sys.executable,
                              '-Port', self.port, '-DataDir', self.data)
        self.assertEqual(started.returncode, 0, started.stdout + started.stderr)
        health = self.request('/api/health')
        # Hosted Windows may expose TEMP through an 8.3 alias; compare identity.
        self.assertTrue(Path(health['appDir']).samefile(ROOT))
        self.assertTrue(Path(health['dataDir']).samefile(self.data))
        refused = self.script('Stop-Studio.ps1', '-Port', self.port, '-DataDir', self.data.parent / 'wrong')
        self.assertNotEqual(refused.returncode, 0)
        self.assertEqual(self.request('/api/health')['pid'], health['pid'])
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            another_port = listener.getsockname()[1]
        duplicate = subprocess.run([sys.executable, '-B', str(ROOT / 'server.py'), '--port', str(another_port),
                                    '--data-dir', str(self.data)], capture_output=True, text=True,
                                   errors='replace', timeout=10, env=self.environment,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertNotEqual(duplicate.returncode, 0)
        self.assertIn('already in use', duplicate.stderr)
        self.assertEqual(self.request('/api/health')['pid'], health['pid'])
        stopped = self.script('Stop-Studio.ps1', '-Port', self.port, '-DataDir', self.data)
        self.assertEqual(stopped.returncode, 0, stopped.stdout + stopped.stderr)
        with self.assertRaises(urllib.error.URLError):
            self.request('/api/health')

    def test_environment_configuration_and_repeated_start_reuse_same_instance(self):
        environment = {**self.environment, 'STUDIO_PYTHON': sys.executable,
                       'STUDIO_PORT': str(self.port), 'STUDIO_DATA_DIR': str(self.data)}
        started = self.script('Start-Studio.ps1', '-NoBrowser', environment=environment)
        self.assertEqual(started.returncode, 0, started.stdout + started.stderr)
        health = self.request('/api/health')
        reused = self.script('Start-Studio.ps1', '-NoBrowser', environment=environment)
        self.assertEqual(reused.returncode, 0, reused.stdout + reused.stderr)
        self.assertEqual(self.request('/api/health')['pid'], health['pid'])
        stopped = self.script('Stop-Studio.ps1', environment=environment)
        self.assertEqual(stopped.returncode, 0, stopped.stdout + stopped.stderr)

    def test_discovers_an_installed_python_without_explicit_path(self):
        started = self.script('Start-Studio.ps1', '-NoBrowser', '-Port', self.port, '-DataDir', self.data)
        self.assertEqual(started.returncode, 0, started.stdout + started.stderr)
        self.assertTrue(Path(self.request('/api/health')['dataDir']).samefile(self.data))
        stopped = self.script('Stop-Studio.ps1', '-Port', self.port, '-DataDir', self.data)
        self.assertEqual(stopped.returncode, 0, stopped.stdout + stopped.stderr)


if __name__ == '__main__':
    unittest.main(verbosity=2)
