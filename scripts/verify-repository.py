"""Check publishable source paths and the unchanged HarmonyOS baseline."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED_PARTS = {'data', 'backups', 'logs', 'signing', 'node_modules', 'oh_modules',
                  '.hvigor', '.build-cache', 'build', '__pycache__', '.compiled', '.venv', '.local', '.local-data', 'artifacts'}
EXCLUDED_SUFFIXES = {'.p12', '.pfx', '.pem', '.key', '.cer', '.p7b', '.keystore', '.jks',
                     '.hap', '.app', '.db', '.sqlite', '.sqlite3', '.log', '.pyc'}


def source_files():
    # Use Git's publication boundary, including new untracked but non-ignored files.
    result = subprocess.run(['git', '-C', str(ROOT), 'ls-files', '--cached', '--others',
                             '--exclude-standard', '-z'], capture_output=True, check=True)
    return sorted(set(result.stdout.decode('utf-8').rstrip('\0').split('\0')) - {''})


def verify():
    baseline = json.loads((ROOT / 'shared/harmony-baseline.json').read_text(encoding='utf-8-sig'))
    errors = []
    for entry in baseline['files']:
        path = ROOT / entry['path']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest().upper() != entry['sha256'].upper():
            errors.append((entry['path'], 'preserved mobile file changed or missing'))
    files = source_files()
    for relative in files:
        path = ROOT / relative
        if path.is_symlink():
            errors.append((relative, 'symlinks must not expose external data'))
            continue
        if not path.is_file():
            errors.append((relative, 'tracked file missing'))
            continue
        parts = set(Path(relative).parts)
        if parts & EXCLUDED_PARTS or path.suffix.lower() in EXCLUDED_SUFFIXES or path.name in {'local.properties', '.env', 'secrets.bin', '.instance.lock'}:
            errors.append((relative, 'private/runtime file is publishable'))
        if path.stat().st_size > 5 * 1024 * 1024:
            errors.append((relative, 'unexpected file larger than 5 MiB'))
        if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.ico'}:
            continue
        try:
            text = path.read_text(encoding='utf-8-sig')
        except UnicodeDecodeError:
            errors.append((relative, 'unexpected binary file'))
            continue
        # Report the path/rule only, never echo potential credentials.
        checks = {
            'provider key pattern': r'\bsk-[a-fA-F0-9]{24,}\b',
            'GitHub token pattern': r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b',
            'private key header': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
            'user profile path': r'[A-Za-z]:[\\/]Users[\\/](?!<|Public|Default)[A-Za-z0-9_\u4e00-\u9fff.-]+',
        }
        for label, pattern in checks.items():
            if re.search(pattern, text):
                errors.append((relative, label))
    if errors:
        for relative, reason in errors:
            print(f'FAIL {relative}: {reason}')
        return 1
    print(f'Public source boundary verified: {len(files)} files; {len(baseline["files"])} preserved mobile files match')
    return 0


if __name__ == '__main__':
    sys.exit(verify())

