import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createD1, installBindings } from './helpers/d1.mjs';

test('migration preserves existing votes; totals track switches, identity merges, rollback and cascades', () => {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter(f => f.endsWith('.sql') && f < '0008').sort()) {
    sql.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  sql.exec(`INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES
    (1,'one','One','2026-09-01','One','published'),(2,'two','Two','2026-09-01','Two','published');
    INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES
    (1,'a','like'),(1,'b','dislike'),(2,'a','like');`);
  const before = sql.prepare('SELECT * FROM review_reaction_votes ORDER BY review_id,voter_key').all();
  sql.exec(readFileSync('migrations/0008_read_efficiency.sql', 'utf8'));
  assert.deepEqual(sql.prepare('SELECT * FROM review_reaction_votes ORDER BY review_id,voter_key').all(), before);
  const verify = () => {
    const mismatch = sql.prepare(`SELECT r.id FROM reviews r LEFT JOIN review_reaction_totals t ON t.review_id=r.id
      LEFT JOIN review_reaction_votes v ON v.review_id=r.id GROUP BY r.id
      HAVING COALESCE(t.likes,0)<>COALESCE(SUM(v.reaction='like'),0)
        OR COALESCE(t.dislikes,0)<>COALESCE(SUM(v.reaction='dislike'),0)`).all();
    assert.deepEqual(mismatch, []);
  };
  verify();
  for (const change of [
    "INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(1,'c','like')",
    "UPDATE review_reaction_votes SET reaction='dislike' WHERE voter_key='c'",
    "UPDATE review_reaction_votes SET review_id=2 WHERE voter_key='c'",
    "UPDATE review_reaction_votes SET voter_key='renamed' WHERE voter_key='c'",
    "DELETE FROM review_reaction_votes WHERE review_id=1 AND voter_key='a'",
    "BEGIN; UPDATE review_reaction_votes SET reaction='like'; ROLLBACK;",
    "DELETE FROM reviews WHERE id=2",
    "INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES(2,'replacement','Replacement','2026-09-01','Two','published')",
  ]) { sql.exec(change); verify(); }
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM review_reaction_totals WHERE review_id=2').get().n, 0);
  sql.close();
});

const db = createD1();
const exports = [];
installBindings({ CONTENT_DB: db, LEGACY_REACTIONS: { getByName(slug) {
  return { async exportVotes() { exports.push(slug); return []; } };
} } });
const { GET } = await import('../src/pages/api/reaction-counts.ts');
const { getAdminAnalytics } = await import('../src/lib/data/analytics.ts');
const { getReviewBySlug } = await import('../src/lib/data/reviews.ts');
const { listRelatedReviews } = await import('../src/lib/data/related-reviews.ts');
const { listApprovedComments } = await import('../src/lib/data/comments.ts');
db.sqlite.exec(`INSERT INTO reviews(id,slug,title,language,reviewed_date,body_html,status) VALUES
  (1,'one','One','Telugu','2026-09-01','<p>One</p>','published'),
  (2,'two','Two','Telugu','2026-09-02','Two','published'),
  (3,'hidden','Hidden','Telugu','2026-09-03','Hidden','archived'),
  (4,'four','Four','Tamil','2026-09-04','Four','published'),
  (5,'five','Five','Telugu','2026-09-05','Five','published'),
  (6,'six','Six','Tamil','2026-09-06','Six','published');
  INSERT INTO review_gallery(review_id,image_url,position) VALUES(1,'/image.webp',0);
  INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(1,'old','like'),(1,'new','dislike'),(2,'old','like');`);
const counts = (slugs, values = {}) => GET({
  url: new URL(`https://example.com/api/reaction-counts?${new URLSearchParams(slugs.map(s => ['slug', s]))}`),
  cookies: { get: key => values[key] ? { value: values[key] } : undefined },
});

test('bounded count API rejects malformed lists before D1, hides archived reviews and personal state', async () => {
  for (const slugs of [[], [''], ['x'.repeat(181)], Array(7).fill('one')]) {
    const before = db.metrics.statements;
    assert.equal((await counts(slugs)).status, 400);
    assert.equal(db.metrics.statements, before);
  }
  const result = await counts(['ONE', 'one', 'hidden', 'missing', 'two'], { mrp_voter: 'old', mrp_reaction_voter: 'new' });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await result.json()).counts.sort((a,b) => a.slug.localeCompare(b.slug)), [
    { slug: 'one', likes: 0, dislikes: 1 }, { slug: 'two', likes: 1, dislikes: 0 },
  ]);
  assert.deepEqual([...exports].sort(), ['one', 'two']);
  const before = db.metrics.statements;
  await counts(['one', 'two']);
  assert.equal(db.metrics.statements - before, 3, 'one slug lookup, one bounded import check, one totals read');
});

test('detail rendering omits only unused gallery read; recommendations retain priority and fill four slots', async () => {
  const full = await getReviewBySlug('one');
  const before = db.metrics.statements;
  const lean = await getReviewBySlug('ONE', { includeGallery: false });
  assert.equal(db.metrics.statements - before, 2);
  assert.equal(full.gallery.length, 1);
  assert.deepEqual(lean, { ...full, gallery: [] });
  assert.deepEqual((await listRelatedReviews(lean)).map(r => r.id), [5, 2, 6, 4]);
  assert.deepEqual((await listRelatedReviews(lean, 2)).map(r => r.id), [5, 2]);
});

test('public comments retain date ordering and use the requested review after a slug change', async () => {
  db.sqlite.exec(`INSERT INTO comments(target_type,target_id,review_id,author_name,body,status,created_at,approved_at) VALUES
    ('review','old-slug',1,'A','older','approved','2026-09-01',NULL),
    ('review','old-slug',1,'B','newer','approved','2026-09-02',NULL),
    ('review','old-slug',1,'C','approved later','approved','2026-09-01','2026-09-03'),
    ('review','old-slug',1,'D','pending','pending','2026-09-04',NULL),
    ('review','two',2,'E','unrelated','approved','2026-09-05',NULL);`);
  const rows = await listApprovedComments('review', 'ONE', 2);
  assert.deepEqual(rows.map(r => r.comment), ['approved later', 'newer']);
  assert(rows.every(r => r.targetId === 'one'));
});

test('dashboard reuses unchanged results, counts visitors exactly and invalidates every source', async () => {
  const realNow = Date.now;
  let now = Date.parse('2026-09-10T12:00:00Z');
  Date.now = () => now;
  try {
    db.sqlite.exec(`INSERT INTO page_views(visitor_key,page_type,page_key,review_slug,created_at) VALUES
      ('same','home','/',NULL,'2026-09-09 14:00:00'),
      ('same','review','/review/one','one','2026-09-10 10:00:00'),
      ('other','review','/review/one','one','2026-09-10 11:00:00'),
      ('outside','home','/',NULL,'2026-09-08 10:00:00');`);
    await getAdminAnalytics(1); // Finish any one-time legacy import.
    const first = await getAdminAnalytics(1);
    assert.equal(first.views, 3);
    assert.equal(first.uniqueVisitors, 2, 'one visitor on two pages/days stays one unique');
    assert.equal(first.topPages.find(p => p.slug === 'one').visitors, 2);
    let before = db.metrics.statements;
    now += 15000;
    assert.deepEqual(await getAdminAnalytics(1), first);
    assert.equal(db.metrics.statements - before, 1, 'unchanged poll reads only the revision row');
    for (const [change, verify] of [
      ["INSERT INTO page_views(visitor_key,page_type,page_key,created_at) VALUES('third','home','/','2026-09-10 12:00:00')", r => assert.equal(r.uniqueVisitors, 3)],
      ["UPDATE reviews SET title='Renamed' WHERE id=1", r => assert.equal(r.topPages.find(p=>p.slug==='one').title, 'Renamed')],
      ["UPDATE reviews SET status='archived' WHERE id=6", r => assert.equal(r.reviewCount, 4)],
      ["INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(4,'someone','like')", r => assert.equal(r.reactionTotals.like, 2)],
      ["UPDATE review_reaction_votes SET reaction='dislike' WHERE review_id=4", r => assert.equal(r.reactionTotals.like, 1)],
      ["DELETE FROM review_reaction_votes WHERE review_id=4", r => assert.equal(r.reactionTotals.dislike, 1)],
      ["UPDATE comments SET status='approved' WHERE body='pending'", r => assert.equal(r.commentCounts.pending, 0)],
      ["DELETE FROM page_views WHERE visitor_key='third'", r => assert.equal(r.uniqueVisitors, 2)],
      ["DELETE FROM reviews WHERE id=4", r => assert.equal(r.reviewCount, 3)],
    ]) {
      db.sqlite.exec(change);
      before = db.metrics.statements;
      verify(await getAdminAnalytics(1));
      assert(db.metrics.statements - before > 1, 'changed source must recompute');
    }
    before = db.metrics.statements;
    await getAdminAnalytics(30);
    assert(db.metrics.statements - before > 1, 'range change must recompute');
    now += 61000;
    before = db.metrics.statements;
    await getAdminAnalytics(30);
    assert(db.metrics.statements - before > 1, 'snapshot has a maximum sixty-second lifetime');
    now -= 120000;
    before = db.metrics.statements;
    await getAdminAnalytics(30);
    assert(db.metrics.statements - before > 1, 'clock rollback must not reuse a future snapshot');
    // An inclusive rolling cutoff drops an old view at the next second, even with no write.
    db.sqlite.exec("DELETE FROM page_views; INSERT INTO page_views(visitor_key,page_type,page_key,created_at) VALUES('edge','home','/','2026-09-09 12:00:00')");
    now = Date.parse('2026-09-10T12:00:00.500Z');
    assert.equal((await getAdminAnalytics(1)).views, 1);
    now += 500;
    assert.equal((await getAdminAnalytics(1)).views, 0);
  } finally { Date.now = realNow; }
});
