"""Share video IDs without changing mobile code or desktop teaching/runtime text."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT / 'apps/desktop/content/curriculum.json'
MOBILE = ROOT / 'apps/harmony/entry/src/main/resources/rawfile/curriculum.json'
CATALOG = ROOT / 'shared/video-catalog.json'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--check', action='store_true')
    group.add_argument('--write', action='store_true')
    args = parser.parse_args()
    mobile = json.loads(MOBILE.read_text(encoding='utf-8'))
    catalog = {'schemaVersion': 1, 'source': 'HarmonyOS 1.1.6 r3 bundled curriculum',
               'resources': mobile['resources'],
               'lessonResources': {lesson['id']: lesson['resourceIds'] for lesson in mobile['lessons']}}
    desktop = json.loads(DESKTOP.read_text(encoding='utf-8'))
    desktop['resources'] = catalog['resources']
    for lesson in desktop['lessons']:
        lesson['resourceIds'] = catalog['lessonResources'][lesson['id']]
    if args.write:
        CATALOG.parent.mkdir(parents=True, exist_ok=True)
        CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        DESKTOP.write_text(json.dumps(desktop, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert json.loads(CATALOG.read_text(encoding='utf-8')) == catalog, 'Shared video catalog drift'
    assert json.loads(DESKTOP.read_text(encoding='utf-8')) == desktop, 'Desktop video mapping drift'
    print(f"Video catalog verified: {len(catalog['resources'])} resources, {len(catalog['lessonResources'])} lesson mappings")


if __name__ == '__main__':
    main()

