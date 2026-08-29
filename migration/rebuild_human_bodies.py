#!/usr/bin/env python3
import html as html_lib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'migration' / 'raw'
EDITED = ROOT / 'migration' / 'edited'
MANIFEST = RAW / 'manifest.json'
REPORT = ROOT / 'migration' / 'compiled' / 'human-body-rebuild-report.json'

OPENING_WATCHED = re.compile(
    r'(<p\b[^>]*>)\s*Watched\s+#?[^:<]{1,100}?\s*(?::|[-–—]|&#(?:8211|8212);|&(?:ndash|mdash);)\s*',
    re.I,
)
COMMENTS = re.compile(r'<!--.*?-->', re.S)
EMPTY_P = re.compile(r'<p\b[^>]*>\s*(?:&nbsp;|\u00a0)?\s*</p>', re.I)
ANCHOR_OPEN = re.compile(r'<a\b[^>]*>', re.I)
ANCHOR_CLOSE = re.compile(r'</a\s*>', re.I)
ALLOWED_OPEN = re.compile(r'<(p|strong|em|ol|li|br)\b[^>]*>', re.I)
LEGACY = ('wordpress.com', '/wp-content/', 'public-api.wordpress.com')
SPACED_SMART_DASH = re.compile(r'\s+(?:[–—]|&(?:ndash|mdash);|&#(?:8211|8212);)\s+', re.I)
SMART_DASH = re.compile(r'(?:[–—]|&(?:ndash|mdash);|&#(?:8211|8212);)', re.I)


def normalize_human_punctuation(text: str) -> str:
    # A spaced smart dash is usually being used as an aside. A comma reads more
    # naturally in Poorna's conversational review style. Range/compound dashes
    # without surrounding spaces become an ordinary keyboard hyphen.
    text = SPACED_SMART_DASH.sub(', ', text)
    text = SMART_DASH.sub('-', text)
    while '--' in text:
        text = text.replace('--', '-')
    text = re.sub(r',\s*,+', ', ', text)
    return text


def clean_html(raw_html: str) -> str:
    text = raw_html or ''
    text = COMMENTS.sub('', text)
    text = ANCHOR_OPEN.sub('', text)
    text = ANCHOR_CLOSE.sub('', text)
    text = OPENING_WATCHED.sub(r'\1', text, count=1)
    text = EMPTY_P.sub('', text)

    def strip_attrs(match):
        tag = match.group(1).lower()
        return '<br>' if tag == 'br' else f'<{tag}>'

    text = ALLOWED_OPEN.sub(strip_attrs, text)
    # Normalize only layout whitespace between tags. Keep the author's wording intact.
    text = re.sub(r'>\s+<', '><', text)
    text = normalize_human_punctuation(text.strip())
    return text


def main():
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    source_by_id = {int(x['id']): RAW / x['source_file'] for x in manifest}
    edited_files = sorted(EDITED.glob('*.json'))
    seen = set()
    changed_ids = []
    opening_removed = []
    anchor_flattened = []

    for batch_path in edited_files:
        rows = json.loads(batch_path.read_text(encoding='utf-8'))
        changed = False
        for row in rows:
            rid = int(row['i'])
            if rid in seen:
                raise SystemExit(f'duplicate edited id {rid}')
            seen.add(rid)
            source_path = source_by_id.get(rid)
            if not source_path or not source_path.exists():
                raise SystemExit(f'missing raw source for {rid}')
            raw = json.loads(source_path.read_text(encoding='utf-8'))
            raw_html = raw.get('content_html') or ''
            if OPENING_WATCHED.search(raw_html):
                opening_removed.append(rid)
            if ANCHOR_OPEN.search(raw_html):
                anchor_flattened.append(rid)
            body = clean_html(raw_html)
            if not body:
                raise SystemExit(f'empty cleaned body for {rid}')
            decoded = html_lib.unescape(body)
            low = decoded.lower()
            hits = [marker for marker in LEGACY if marker in low]
            if hits:
                raise SystemExit(f'legacy URL marker remains in cleaned body {rid}: {hits}')
            if re.search(r'<(?:img|figure|iframe|script)\b', body, re.I):
                raise SystemExit(f'unsafe/non-content HTML remains in cleaned body {rid}')
            if '--' in body or '–' in decoded or '—' in decoded:
                raise SystemExit(f'forbidden dash style remains in cleaned body {rid}')
            if row.get('body') != body:
                row['body'] = body
                changed = True
                changed_ids.append(rid)
        if changed:
            batch_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    expected = set(source_by_id)
    if seen != expected:
        raise SystemExit(f'edited/raw ID mismatch: missing={sorted(expected-seen)}, extra={sorted(seen-expected)}')

    report = {
        'total': len(seen),
        'body_source': 'original WordPress content_html with structural cleanup and simple human punctuation normalization',
        'changed_total': len(set(changed_ids)),
        'opening_watched_labels_removed': sorted(set(opening_removed)),
        'anchors_flattened_to_text': sorted(set(anchor_flattened)),
        'legacy_wordpress_refs_in_cleaned_bodies': 0,
        'double_hyphen_refs_in_cleaned_bodies': 0,
        'en_dash_refs_in_cleaned_bodies': 0,
        'em_dash_refs_in_cleaned_bodies': 0,
        'ready': len(seen) == 137,
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
