#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDITED = ROOT / 'migration' / 'edited'
OVERRIDES = ROOT / 'migration' / 'verdict-overrides.json'
STATUS = ROOT / 'migration' / 'verdict-pass-status.json'
EXPECTED_TOTAL = 137


def main():
    data = json.loads(OVERRIDES.read_text(encoding='utf-8'))
    if not isinstance(data, list):
        raise SystemExit('verdict-overrides.json must be an array')

    overrides = {}
    for item in data:
        if not isinstance(item, dict) or 'i' not in item or 'v' not in item:
            raise SystemExit('every verdict override requires i and v')
        rid = int(item['i'])
        verdict = str(item['v']).strip()
        if rid in overrides:
            raise SystemExit(f'duplicate verdict override id {rid}')
        if not verdict:
            raise SystemExit(f'empty verdict for {rid}')
        if '--' in verdict or '—' in verdict:
            raise SystemExit(f'forbidden dash style in verdict {rid}')
        overrides[rid] = verdict

    if len(overrides) != EXPECTED_TOTAL:
        raise SystemExit(f'expected {EXPECTED_TOTAL} verdict overrides, found {len(overrides)}')

    seen = set()
    changed = 0
    for path in sorted(EDITED.glob('*.json')):
        rows = json.loads(path.read_text(encoding='utf-8'))
        dirty = False
        for row in rows:
            rid = int(row['i'])
            if rid in seen:
                raise SystemExit(f'duplicate edited review id {rid}')
            seen.add(rid)
            if rid not in overrides:
                raise SystemExit(f'missing verdict override for edited review {rid}')
            if row.get('v') != overrides[rid]:
                row['v'] = overrides[rid]
                dirty = True
                changed += 1
        if dirty:
            path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    extra = sorted(set(overrides) - seen)
    missing = sorted(seen - set(overrides))
    if extra or missing or len(seen) != EXPECTED_TOTAL:
        raise SystemExit(f'verdict/edited id mismatch: total={len(seen)}, missing={missing}, extra={extra}')

    status = {
        'total': EXPECTED_TOTAL,
        'rewritten': len(overrides),
        'changed_in_this_run': changed,
        'double_dash_verdicts': 0,
        'emdash_verdicts': 0,
        'status': 'complete',
    }
    STATUS.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(status, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
