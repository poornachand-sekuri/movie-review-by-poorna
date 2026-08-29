#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EDITED = ROOT / 'migration' / 'edited'
RAW_MANIFEST = ROOT / 'migration' / 'raw' / 'manifest.json'
COMPILED = ROOT / 'migration' / 'compiled'
CATALOG = COMPILED / 'native-reviews.json'
REPORT = COMPILED / 'qa-report.json'

REQUIRED = ('i','t','s','d','l','rd','r','v','e','body','poster_source','poster_target')
OPENING_HASHTAG = re.compile(r'^\s*(?:<p[^>]*>)?\s*watched\s+#?[^:<]{1,80}\s*[:\-–—]', re.I)
MOVIE_HASHTAG = re.compile(r'(?<![\w/])#[A-Za-z0-9][A-Za-z0-9_-]*')


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    manifest = load_json(RAW_MANIFEST)
    batches = []
    for path in sorted(EDITED.glob('*.json')):
        data = load_json(path)
        if not isinstance(data, list):
            raise SystemExit(f'{path}: expected a JSON array')
        for row in data:
            row['_batch'] = path.name
            batches.append(row)

    errors, warnings = [], []
    seen_ids, seen_slugs = {}, {}
    for row in batches:
        ident = row.get('i')
        slug = row.get('s')
        where = f"{row.get('_batch')}:{ident or slug or '?'}"
        for field in REQUIRED:
            if field not in row or row[field] in (None, ''):
                errors.append(f'{where}: missing {field}')
        if ident in seen_ids:
            errors.append(f'{where}: duplicate id {ident} also in {seen_ids[ident]}')
        else:
            seen_ids[ident] = where
        if slug in seen_slugs:
            errors.append(f'{where}: duplicate slug {slug} also in {seen_slugs[slug]}')
        else:
            seen_slugs[slug] = where

        rating = row.get('r')
        if not isinstance(rating, (int, float)) or not (0 <= rating <= 5):
            errors.append(f'{where}: invalid rating {rating!r}')
        for date_field in ('d','rd'):
            if row.get(date_field) and not re.fullmatch(r'\d{4}-\d{2}-\d{2}', str(row[date_field])):
                errors.append(f'{where}: invalid {date_field} {row[date_field]!r}')
        if not str(row.get('poster_target','')).startswith('https://assets.moviereviewbypoorna.com/reviews/'):
            errors.append(f'{where}: poster_target is not first-party R2')
        body = str(row.get('body',''))
        if OPENING_HASHTAG.search(body):
            errors.append(f'{where}: leftover Watched #Movie opening')
        hashtags = sorted(set(MOVIE_HASHTAG.findall(re.sub(r'<[^>]+>', ' ', body))))
        if hashtags:
            warnings.append({'review': slug, 'issue': 'hashtags remain in review body', 'values': hashtags})
        if 'wordpress.com' in body.lower() or '/wp-content/' in body.lower():
            errors.append(f'{where}: WordPress URL remains inside review body')

    raw_ids = {int(x['id']) for x in manifest}
    edited_ids = {int(x['i']) for x in batches if x.get('i') is not None}
    unknown = sorted(edited_ids - raw_ids)
    missing = sorted(raw_ids - edited_ids)
    if unknown:
        errors.append(f'Edited records not present in raw archive: {unknown}')

    clean_rows = []
    for row in sorted(batches, key=lambda x: (str(x.get('d','')), int(x.get('i',0))), reverse=True):
        clean_rows.append({k:v for k,v in row.items() if not k.startswith('_')})

    COMPILED.mkdir(parents=True, exist_ok=True)
    CATALOG.write_text(json.dumps(clean_rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    report = {
        'raw_total': len(manifest),
        'edited_total': len(clean_rows),
        'remaining_total': len(missing),
        'completion_percent': round((len(clean_rows) / len(manifest) * 100), 2) if manifest else 0,
        'errors': errors,
        'warnings': warnings,
        'remaining_ids': missing,
        'ready_for_cutover': len(clean_rows) == len(manifest) and not errors,
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
