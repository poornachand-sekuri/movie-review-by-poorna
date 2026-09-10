import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
const statements = [];
const prepare = db.prepare.bind(db);
db.prepare = sql => { statements.push(sql); return prepare(sql); };
const exported = [];
installBindings({ CONTENT_DB: db, LEGACY_REACTIONS: { getByName(slug) {
  return { async exportVotes() { exported.push(slug); return []; } };
} } });
const { importLegacyReactions } = await import('../src/lib/data/legacy-reactions.ts');
const { ensureReactionSchema, setReviewReaction } = await import('../src/lib/data/reactions.ts');
const { listRelatedReviewsByCredits } = await import('../src/lib/data/reviews.ts');
const insert = db.sqlite.prepare("INSERT INTO reviews (id,slug,title,reviewed_date,body_html,status) VALUES (?, ?, 'Review', '2026-09-10', '<p>Review</p>', ?)");
for (let id = 1; id <= 3000; id++) insert.run(id, `review-${id}`, id === 3 ? 'archived' : 'published');
db.sqlite.exec(`INSERT INTO legacy_import_audit (review_id,source_sha256,source_json)
  VALUES (1, 'fixture', '{"s":"original-slug"}');`);

test('single-review import uses a primary-key lookup and preserves the original source slug', async () => {
  await ensureReactionSchema();
  statements.length = 0;
  await importLegacyReactions(1);
  assert.deepEqual(exported, ['original-slug']);
  const plan = db.sqlite.prepare(`EXPLAIN QUERY PLAN ${statements[0]}`).all({ 1: 1 });
  assert(plan.some(row => /SEARCH r USING INTEGER PRIMARY KEY/.test(row.detail)), 'review selection must seek its ID');
  const imports = exported.length;
  await importLegacyReactions(1);
  await importLegacyReactions(3);
  await importLegacyReactions(9999);
  assert.equal(exported.length, imports, 'completed, archived and missing reviews do not export');
});

test('explicit voting checks migration once, writes once and returns the current totals', async () => {
  const before = db.metrics.statements;
  assert.deepEqual(await setReviewReaction('review-1', 'reader', 'like', null, true), {
    likes: 1, dislikes: 0, viewerReaction: 'like',
  });
  // Published slug + migration marker + vote write + aggregate; no second marker lookup.
  assert.equal(db.metrics.statements - before, 4);
});

test('catalogue import still covers all remaining published reviews exactly once', async () => {
  await importLegacyReactions();
  assert.equal(exported.length, 2999);
  assert(!exported.includes('review-3'));
  const count = exported.length;
  await importLegacyReactions();
  assert.equal(exported.length, count);
});

test('related recommendations preserve role priority, date ties, publication filtering and self exclusion', async () => {
  db.sqlite.exec(`INSERT INTO people (id,name) VALUES (1,'Director'),(2,'Actor'),(3,'Actress'),(4,'Composer');
    INSERT INTO review_credits (review_id,person_id,role,position) VALUES
    (1,1,'director',0),(1,2,'actor',0),(1,3,'actress',0),(1,4,'music_director',0),
    (2,1,'director',0),(3,1,'director',0),(4,2,'actor',0),(5,3,'actress',0),
    (6,4,'music_director',0),(7,1,'actor',0),(8,1,'director',0);`);
  assert.deepEqual((await listRelatedReviewsByCredits(1)).map(r => r.id), [8,2,4,5]);
  assert.deepEqual((await listRelatedReviewsByCredits(1, 1)).map(r => r.id), [8]);
  assert.deepEqual(await listRelatedReviewsByCredits(0), []);
});
