"""Validate references and execute every authored reference solution, using temp files only."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.runtime import compiler_path

def normalize(value):
    return '\n'.join(line.rstrip() for line in value.replace('\r\n', '\n').strip().splitlines())

def main():
    compiler = compiler_path()
    if not compiler:
        raise SystemExit('GCC was not found. Install GCC and add its bin directory to PATH before validating reference solutions.')
    gcc = Path(compiler)
    curriculum = json.loads((ROOT / 'content' / 'curriculum.json').read_text(encoding='utf-8'))
    lookup = {}
    for key in ['modules', 'lessons', 'exercises', 'resources']:
        lookup[key] = {item['id']: item for item in curriculum[key]}
        assert len(lookup[key]) == len(curriculum[key]), f'duplicate {key}'
    for lesson in curriculum['lessons']:
        assert lesson['moduleId'] in lookup['modules'], lesson['id']
        for resource in lesson['resourceIds']:
            assert resource in lookup['resources'], resource
        for exercise in lesson['exerciseIds']:
            assert lookup['exercises'][exercise]['lessonId'] == lesson['id'], exercise
        if lesson['available']:
            assert lesson['sections'] and lesson['objectives'] and lesson['exerciseIds'], lesson['id']
    checks = []
    env = dict(os.environ)
    env['PATH'] = str(gcc.parent) + os.pathsep + env.get('PATH', '')
    for exercise in curriculum['exercises']:
        assert exercise['lessonId'] in lookup['lessons'], exercise['id']
        assert exercise['explanation'] and exercise['hints'], exercise['id']
        if exercise['type'] == 'quiz':
            assert isinstance(exercise['answer'], int) and 0 <= exercise['answer'] < len(exercise['choices']), exercise['id']
            checks.append({'id': exercise['id'], 'status': 'quiz-shape-pass'})
            continue
        assert exercise['tests'] and exercise['solution'] and exercise['starter'], exercise['id']
        with tempfile.TemporaryDirectory(prefix='studio-course-') as directory:
            job = Path(directory)
            source = job / 'solution.c'
            executable = job / 'solution.exe'
            source.write_text(exercise['solution'], encoding='utf-8')
            env['TMP'] = env['TEMP'] = directory
            build = subprocess.run([str(gcc), '-std=c11', '-Wall', '-Wextra', str(source), '-o', str(executable)], capture_output=True, timeout=20, env=env)
            assert build.returncode == 0, (exercise['id'], build.stderr.decode(errors='replace'))
            for case in exercise['tests']:
                result = subprocess.run([str(executable)], input=case['input'], text=True, capture_output=True, timeout=3, cwd=directory, env=env)
                assert result.returncode == 0, (exercise['id'], result.returncode, result.stderr)
                assert normalize(result.stdout) == normalize(case['expected']), (exercise['id'], case, result.stdout)
            checks.append({'id': exercise['id'], 'status': 'reference-pass', 'cases': len(exercise['tests'])})
    print(json.dumps({'lessons': len(curriculum['lessons']), 'availableLessons': sum(bool(x['available']) for x in curriculum['lessons']), 'exerciseCount': len(checks), 'codeCases': sum(x.get('cases', 0) for x in checks), 'checks': checks}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
