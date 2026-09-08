import concurrent.futures as futures
import datetime as dt
import html.parser
import json
import sys
import urllib.parse
from pathlib import Path

CACHE = json.load(sys.stdin)
BASE = CACHE['base']
OUT = Path('/tmp/content-audit-results.json')
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())

class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []
    def text(self):
        return ''.join(c if isinstance(c, str) else c.text() for c in self.children)
    def all(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.all()

class Parser(html.parser.HTMLParser):
    def __init__(self, markup):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(markup)
    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break
    def handle_data(self, text):
        self.stack[-1].children.append(text)

def get(path):
    response = CACHE['responses'][path]
    if response['status'] != 200:
        raise RuntimeError(f"HTTP {response['status']}: {path}")
    return response['text'], response['headers'], response['url']

def getjson(path):
    return json.loads(get(path)[0])

def norm(value):
    return ' '.join(str(value if value is not None else '').split())

catalogue=[]
offset=0
while True:
    page=getjson(f'/api/reviews?limit=60&offset={offset}')['items']
    catalogue.extend(page)
    if len(page)<60:
        break
    offset+=len(page)
by_slug={r['slug']:r for r in catalogue}
assert len(by_slug)==len(catalogue), 'Duplicate catalogue slugs'
print(f'Auditing {len(catalogue)} published reviews', flush=True)

def audit(summary):
    slug=summary['slug']
    path=urllib.parse.quote(slug, safe='')
    errors=[]
    missing=[]
    try:
        review=getjson(f'/api/reviews/{path}')['review']
        markup, headers, url=get(f'/review/{path}')
        reaction=getjson(f'/api/reviews/{path}/reactions')
        nodes=list(Parser(markup).root.all())
        def find(attr, value):
            return next((n for n in nodes if n.attrs.get(attr)==value), None)
        def cls(value):
            return next((n for n in nodes if value in n.attrs.get('class','').split()), None)
        def check(condition, label):
            if not condition:
                errors.append(label)
        def textmatch(node, expected, label):
            check(node is not None and norm(node.text())==norm(expected),label)
        check(urllib.parse.urlparse(url).path==f'/review/{path}', 'page redirected away')
        check(review['slug']==slug and review['id']==summary['id'], 'wrong review identity')
        for key in summary:
            check(review.get(key)==summary[key], f'catalogue/detail mismatch: {key}')
        textmatch(next((n for n in nodes if n.tag=='h1'),None),f"{review['title']} — The Auditorium",'title mismatch')
        textmatch(cls('auditorium-clap-value--watched'),review['language'] or '—','language mismatch')
        release=dt.date.fromisoformat(review['releaseDate']).strftime('%d %b %Y').replace(' Sep ', ' Sept ') if review['releaseDate'] else '—'
        textmatch(cls('auditorium-clap-value--release'),release,'release date mismatch')
        rating=review['rating']
        stars='—' if rating is None else '★'*int(min(5,max(0,rating))+0.5)+'☆'*(5-int(min(5,max(0,rating))+0.5))
        textmatch(cls('auditorium-stars'),stars,'rating mismatch')
        for role,suffix in [('actor','actor'),('actress','actress'),('director','director'),('music_director','music')]:
            expected=', '.join(c['name'] for c in review['credits'] if c['role']==role)
            node=cls('auditorium-credit-value--'+suffix)
            if expected:
                textmatch(node,expected,f'{role} mismatch')
            else:
                check(node is None or not norm(node.text()),f'unexpected {role}')
                missing.append(role)
        textmatch(cls('auditorium-my-pov'),review['verdict'] if review['verdict'] is not None else review['excerpt'] or '—','POV mismatch')
        textmatch(find('id','auditorium-review-body'),Parser(review['bodyHtml']).root.text(),'review text mismatch')
        check(bool(norm(Parser(review['bodyHtml']).root.text())), 'empty review text')
        poster=cls('auditorium-movie-poster')
        check((poster.attrs.get('src') if poster else None)==review['posterUrl'],'poster mapping mismatch')
        for key in ['releaseDate','language','rating','posterUrl']:
            if review.get(key) is None or review.get(key)=='':
                missing.append(key)
        check('no-store' in headers.get('Cache-Control', headers.get('cache-control','')), 'page caching is not disabled')
        for kind,key in [('like','likes'),('dislike','dislikes')]:
            check(isinstance(reaction[key],int) and reaction[key]>=0,'invalid '+key)
            textmatch(find('data-reaction-count',kind),reaction[key],kind+' count mismatch')
        check(find('data-review-slug',slug) is not None,'wrong reaction slug')
        related=[n for n in nodes if 'auditorium-related-card' in n.attrs.get('class','').split()]
        seen=set()
        for node in related:
            target=node.attrs.get('href','').removeprefix('/review/')
            check(target in by_slug and target!=slug and target not in seen,'invalid/duplicate/self related review')
            seen.add(target)
            if target in by_slug:
                check(node.attrs.get('aria-label')==f"Read {by_slug[target]['title']} review",'related title mismatch')
        check(len(related)==min(4,len(catalogue)-1),'related review count')
        return dict(slug=slug,errors=errors,missing_source_fields=missing,likes=reaction['likes'],dislikes=reaction['dislikes'],posterUrl=review['posterUrl'])
    except Exception as e:
        return dict(slug=slug,errors=[str(e)])

results=[]
with futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(audit,catalogue):
        results.append(result)
        if len(results)%20==0 or result['errors']:
            print(json.dumps({'checked':len(results),'slug':result['slug'],'errors':result['errors']}),flush=True)

report={'checked_at':dt.datetime.now(dt.timezone.utc).isoformat(),'reviews':len(results),'passed':sum(not r['errors'] for r in results),'failed':[r for r in results if r['errors']],'missing_source_fields':[{'slug':r['slug'],'fields':r['missing_source_fields']} for r in results if r.get('missing_source_fields')],'nonzero_reactions':[r for r in results if r.get('likes',0) or r.get('dislikes',0)],'results':results}
OUT.write_text(json.dumps(report,indent=2))
print(json.dumps({k:v for k,v in report.items() if k!='results'},indent=2),flush=True)

if report['failed'] or report['reviews'] == 0:
    sys.exit(1)
