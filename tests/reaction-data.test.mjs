import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createD1, installBindings } from './helpers/d1.mjs';
import { readLegacyVotePage } from '../src/lib/legacy-reaction-reader.ts';

const db = createD1();
const legacy = new DatabaseSync(':memory:');
legacy.exec("CREATE TABLE votes (voter_key TEXT PRIMARY KEY, vote TEXT NOT NULL, updated_at TEXT NOT NULL); INSERT INTO votes VALUES ('original-reader', 'like', '2026-09-01T00:00:00Z');");
const sql = { exec(query, ...values) { return { toArray: () => legacy.prepare(query).all(...values) }; } };
let exports = 0;
let fail = false;
installBindings({ CONTENT_DB: db, LEGACY_REACTIONS: { getByName(slug) { return { async exportVotes(after) {
  exports++;
  if (fail) throw new Error('Unavailable source');
  return slug === 'dc' ? readLegacyVotePage(sql, after) : [];
} }; } } });
const reactions = await import('../src/lib/data/reactions.ts');
const api = await import('../src/pages/api/reviews/[slug]/reactions.ts');
const cafe = await import('../src/lib/data/cini-cafe.ts');
const analytics = await import('../src/lib/data/analytics.ts');
db.sqlite.exec("INSERT INTO reviews (id,slug,title,reviewed_date,body_html,status) VALUES (1,'dc','DC','2026-09-01','<p>DC</p>','published'), (2,'other','Other','2026-09-01','<p>Other</p>','published');");
const jar = new Map();
const cookieOptions = [];
const cookies = { get: key => jar.has(key) ? {value:jar.get(key)} : undefined, set(key,value,options) {jar.set(key,value);cookieOptions.push(options);} };
const get = async (slug='dc') => api.GET({params:{slug},cookies});
const post = async (body, slug='dc', origin='https://example.com') => api.POST({params:{slug},cookies,request:new Request(`https://example.com/api/reviews/${slug}/reactions`,{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)})});
const snapshot = async () => (await get()).json();

test('fresh-start API, Café and dashboard ignore archived votes and old cookies', async () => {
  const before = legacy.prepare('SELECT * FROM votes').all();
  jar.set('mrp_voter', 'original-reader');
  const response = await get('DC');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {slug:'DC',likes:0,dislikes:0,viewerReaction:null});
  assert.equal((await cafe.listCiniCafeReviews()).find(x=>x.slug==='dc').likes,0);
  assert.deepEqual((await analytics.getAdminAnalytics()).reactionTotals,{like:0,dislike:0});
  await snapshot();
  assert.equal(exports,0,'application requests must never consult the old store');
  assert.deepEqual(legacy.prepare('SELECT * FROM votes').all(),before,'the old store stays untouched');
});

test('old cookies cannot resurrect a removed vote', async () => {
  assert.equal((await (await post({reaction:null,mode:'set'})).json()).viewerReaction,null);
  for(let i=0;i<3;i++) assert.equal((await snapshot()).likes,0);
});

test('new cookie persists, explicit retries are idempotent, switches and removal affect only DC', async () => {
  jar.clear();
  assert.equal((await (await post({reaction:'like',mode:'set'})).json()).likes,1);
  assert(jar.has('mrp_reaction_voter'));
  assert(cookieOptions[0].httpOnly && cookieOptions[0].secure && cookieOptions[0].path==='/');
  await Promise.all([post({reaction:'like',mode:'set'}),post({reaction:'like',mode:'set'})]);
  assert.equal((await snapshot()).likes,1);
  assert.deepEqual(await (await post({reaction:'dislike',mode:'set'})).json(),{slug:'dc',likes:0,dislikes:1,viewerReaction:'dislike'});
  assert.equal((await (await get('other')).json()).likes,0);
  assert.deepEqual(await (await post({reaction:null,mode:'set'})).json(),{slug:'dc',likes:0,dislikes:0,viewerReaction:null});
});

test('returning browsers use their current cookie without identity-migration writes', async () => {
  db.sqlite.exec("INSERT INTO review_reaction_votes (review_id,voter_key,reaction) VALUES (1,'new-cookie','dislike');");
  jar.set('mrp_voter','old-cookie');jar.set('mrp_reaction_voter','new-cookie');
  assert.deepEqual(await snapshot(),{slug:'dc',likes:0,dislikes:1,viewerReaction:'dislike'});
  const before = db.metrics.statements;
  assert.deepEqual(await reactions.getReviewReactionSnapshot(1, 'new-cookie'),{likes:0,dislikes:1,viewerReaction:'dislike'});
  assert.equal(db.metrics.statements - before, 1, 'a warm snapshot needs only its indexed aggregate');
  await post({reaction:null,mode:'set'});
  assert.equal((await snapshot()).likes,0);
});

test('invalid requests and unknown reviews do not change votes', async () => {
  for(const body of [{reaction:'bad'},{reaction:null},{},{reaction:7,mode:'set'}]) assert.equal((await post(body)).status,400);
  assert.equal((await post({reaction:'like',mode:'set'},'missing')).status,404);
  assert.equal((await post({reaction:'like',mode:'set'},'dc','https://another.example')).status,403);
  assert.equal((await snapshot()).likes,0);
});

test('an unavailable archive cannot break a new review or create import work', async () => {
  db.sqlite.exec("INSERT INTO reviews (id,slug,title,reviewed_date,body_html,status) VALUES (3,'retry','Retry','2026-09-01','<p>Retry</p>','published');");
  fail=true;
  assert.equal((await reactions.getReviewReactionSnapshotBySlug('retry')).likes,0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM legacy_reaction_imports WHERE review_id=3').get().n,0);
  fail=false;
  assert.equal((await reactions.getReviewReactionSnapshotBySlug('retry')).likes,0);
  assert.equal(exports,0);
});

test('legacy reader handles empty namespaces without creating a table', () => {
  const empty=new DatabaseSync(':memory:');
  const emptySql={exec(query,...values){return {toArray:()=>empty.prepare(query).all(...values)};}};
  assert.deepEqual(readLegacyVotePage(emptySql),[]);
  assert.equal(empty.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n,0);
});
