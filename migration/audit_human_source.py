#!/usr/bin/env python3
import json, re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT/'migration/raw/manifest.json').read_text(encoding='utf-8'))
report = {
    'total': len(manifest),
    'opening_watched_label': [],
    'contains_img': [],
    'contains_figure': [],
    'contains_iframe': [],
    'contains_anchor': [],
    'contains_script': [],
    'contains_double_hyphen': [],
    'tag_counts': {},
}
tags = Counter()
for item in manifest:
    p = ROOT/'migration/raw'/item['source_file']
    row = json.loads(p.read_text(encoding='utf-8'))
    html = row.get('content_html') or ''
    rid = int(row['id'])
    title = row.get('title_raw') or ''
    if re.search(r'<p\b[^>]*>\s*Watched\s+#?[^:<]{1,100}\s*:', html, re.I): report['opening_watched_label'].append(rid)
    if re.search(r'<img\b', html, re.I): report['contains_img'].append(rid)
    if re.search(r'<figure\b', html, re.I): report['contains_figure'].append(rid)
    if re.search(r'<iframe\b', html, re.I): report['contains_iframe'].append(rid)
    if re.search(r'<a\b', html, re.I): report['contains_anchor'].append(rid)
    if re.search(r'<script\b', html, re.I): report['contains_script'].append(rid)
    if '--' in html: report['contains_double_hyphen'].append(rid)
    for tag in re.findall(r'<\/?\s*([a-zA-Z0-9]+)\b', html): tags[tag.lower()] += 1
report['tag_counts'] = dict(tags.most_common())
out = ROOT/'migration/compiled/human-source-audit.json'
out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
