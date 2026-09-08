import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Read-only full catalogue audit: use the same native HTTP client as smoke-site.
const base = new URL(process.argv[2] || 'https://moviereviewbypoorna.com').origin;
const responses = {};
async function read(path) {
  const response = await fetch(new URL(path, base), {cache:'no-store',signal:AbortSignal.timeout(30000)});
  const item = {status:response.status,text:await response.text(),headers:Object.fromEntries(response.headers),url:response.url};
  responses[path]=item;
  assert.equal(item.status,200,`HTTP ${item.status}: ${path}`);
  return item;
}
const catalogue=[];
for(let offset=0;;offset+=60) {
  const page=JSON.parse((await read(`/api/reviews?limit=60&offset=${offset}`)).text).items;
  assert(Array.isArray(page));
  catalogue.push(...page);
  if(page.length<60) break;
  assert(offset<10000,'Catalogue pagination did not terminate');
}
assert.equal(new Set(catalogue.map(x=>x.slug)).size,catalogue.length);
console.log(`Collecting ${catalogue.length} live content pages and their authoritative API data.`);
const queue=[...catalogue];
let checked=0;
await Promise.all(Array.from({length:4},async()=>{
  let review;
  while((review=queue.shift())) {
    const slug=encodeURIComponent(review.slug);
    for(const path of [`/api/reviews/${slug}`,`/review/${slug}`,`/api/reviews/${slug}/reactions`]) await read(path);
    checked++;
    if(checked%20===0) console.log(`Collected ${checked}/${catalogue.length}`);
  }
}));
const result=spawnSync('python3',[fileURLToPath(new URL('./audit-content-html.py',import.meta.url))],{
  input:JSON.stringify({base,responses}),encoding:'utf8',maxBuffer:20*1024*1024,
});
process.stdout.write(result.stdout||'');
process.stderr.write(result.stderr||'');
if(result.error) throw result.error;
assert.equal(result.status,0,'Live content audit found discrepancies; see per-review results above.');
