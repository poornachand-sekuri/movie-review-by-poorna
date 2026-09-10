import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
const prepare = db.prepare.bind(db);
const queries = [];
db.prepare = (sql) => {
  const statement = prepare(sql);
  let args = [];
  const bind = statement.bind;
  statement.bind = function (...values) { args = values; return bind.apply(this, values); };
  const execute = statement.execute;
  statement.execute = function () {
    const result = execute.call(this);
    if (/^\s*(SELECT|WITH)/i.test(sql)) {
      const values = Object.fromEntries(args.map((value, index) => [String(index + 1), value]));
      queries.push({ sql, args, returned: result.results.length,
        plan: db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(values).map(({ detail }) => detail) });
    }
    return result;
  };
  return statement;
};
installBindings({ CONTENT_DB: db });
const reviews = await import('../src/lib/data/reviews.ts');
const admin = await import('../src/lib/data/admin-reviews.ts');
const reactions = await import('../src/lib/data/reactions.ts');
const comments = await import('../src/lib/data/comments.ts');
const { listRelatedReviews } = await import('../src/lib/data/related-reviews.ts');

db.sqlite.exec(`
  WITH RECURSIVE n(id) AS (VALUES(1) UNION ALL SELECT id+1 FROM n WHERE id<3000)
  INSERT INTO reviews(id,slug,title,reviewed_date,language,status,body_html)
  SELECT id,'review-'||id,'Review '||id,'2026-09-10',
    CASE WHEN id % 2 = 0 THEN 'Telugu' ELSE 'Hindi' END,'published','<p>Body '||id||'</p>' FROM n;
  INSERT INTO people(id,name) VALUES(1,'Director A'),(2,'Actor B');
  INSERT INTO review_credits(review_id,person_id,role,position) SELECT id,1,'director',0 FROM reviews;
  INSERT INTO review_credits(review_id,person_id,role,position) VALUES(70,2,'actor',0);
  INSERT INTO review_gallery(review_id,image_url,position) SELECT id,'/poster-'||id,0 FROM reviews;
  INSERT INTO review_reaction_votes(review_id,voter_key,reaction) SELECT id,'reader','like' FROM reviews;
  INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(70,'other','dislike');
  INSERT INTO comments(target_type,target_id,review_id,author_name,body,status,created_at)
  SELECT 'review',slug,id,'Reader','Comment '||id,'approved','2026-01-01' FROM reviews;
  INSERT INTO comments(id,target_type,target_id,review_id,author_name,body,status,created_at,approved_at)
  VALUES(4001,'review','old-review-slug',70,'A','Older','approved','2026-08-01','2026-08-03'),
    (4002,'review','review-70',70,'B','Imported without approval date','approved','2026-08-04',NULL),
    (4003,'review','review-70',70,'C','Newer tie','approved','2026-08-04',NULL),
    (4004,'review','review-70',70,'D','Pending','pending','2026-09-10',NULL),
    (4005,'review','review-70',70,'E','Rejected','rejected','2026-09-10',NULL),
    (4010,'lounge','lounge',NULL,'L','First','approved','2026-08-01','2026-08-03'),
    (4011,'lounge','LOUNGE',NULL,'M','Second','approved','2026-08-04',NULL);
  UPDATE reviews SET status='draft' WHERE id=2999;
  UPDATE reviews SET status='archived' WHERE id=3000;
`);

async function trace(run) {
  queries.length = 0;
  const value = await run();
  return { value, queries: [...queries] };
}
const plan = (query) => query.plan.join('\n');
const noTableScan = (query) => assert(!query.plan.some((line) => /^SCAN (?:reviews|r|rc|g|p|comments|review_reaction_votes)\b/.test(line)), plan(query));

test('public detail and admin editor seek one review and only its cast/gallery despite 3000 reviews', async () => {
  const detail = await trace(() => reviews.getReviewBySlug(' REVIEW-70 '));
  assert.equal(detail.value.id,70);
  assert.equal(detail.value.bodyHtml,'<p>Body 70</p>');
  assert.deepEqual(detail.value.credits.map(({ name }) => name),['Actor B','Director A']);
  assert.deepEqual(detail.value.gallery.map(({ imageUrl }) => imageUrl),['/poster-70']);
  assert.equal(detail.queries[0].returned,1);
  assert.match(plan(detail.queries[0]),/SEARCH reviews USING INDEX .*\(slug=\?\)/);
  assert.match(plan(detail.queries[1]),/SEARCH rc USING INDEX .*\(review_id=\?\)/);
  assert.match(plan(detail.queries[2]),/SEARCH g USING INDEX .*\(review_id=\?\)/);
  detail.queries.forEach(noTableScan);

  const editor = await trace(() => admin.getAdminReview(70));
  assert.equal(editor.value.i,70);
  assert.match(plan(editor.queries[0]),/SEARCH reviews USING INTEGER PRIMARY KEY/);
  editor.queries.forEach(noTableScan);
  for (const slug of ['missing','review-2999','review-3000']) {
    const missing = await trace(() => reviews.getReviewBySlug(slug));
    assert.equal(missing.value,null);
    assert(missing.queries.every(({ returned }) => returned === 0));
    missing.queries.forEach(noTableScan);
  }
});

test('reaction lookup seeks the requested slug and counts only that review\'s votes', async () => {
  const read = await trace(() => reactions.getReviewReactionSnapshotBySlug('REVIEW-70','reader'));
  assert.deepEqual(read.value,{likes:1,dislikes:1,viewerReaction:'like'});
  assert.equal(read.queries.length,2);
  assert.match(plan(read.queries[0]),/SEARCH reviews USING INDEX .*\(slug=\?\)/);
  assert.match(plan(read.queries[1]),/SEARCH review_reaction_votes USING INDEX .*\(review_id=\?\)/);
  read.queries.forEach(noTableScan);
});

test('approved review comments seek one stable review ID in display order and stop at the requested limit', async () => {
  const read = await trace(() => comments.listApprovedComments('review','REVIEW-70',2));
  assert.deepEqual(read.value.map(({ id }) => id),[4003,4002]);
  const commentQuery = read.queries.find(({ sql }) => sql.includes('FROM comments'));
  assert.match(plan(commentQuery),/idx_comments_review_public_order \(review_id=\? AND status=\?\)/);
  assert(!plan(commentQuery).includes('TEMP B-TREE'),plan(commentQuery));
  assert.equal(commentQuery.returned,2);
  read.queries.forEach(noTableScan);
  const all = await comments.listApprovedComments('review','review-70',20);
  assert(all.some(({ id, targetId }) => id===4001 && targetId==='review-70'),'renamed reviews retain their comments');
  assert(!all.some(({ id }) => id===4004 || id===4005),'unapproved comments remain private');
});

test('Lounge comments use their own ordered index without reading review comments', async () => {
  const read = await trace(() => comments.listApprovedComments('lounge','lounge',1));
  assert.deepEqual(read.value.map(({ id }) => id),[4011]);
  assert.equal(read.queries.length,1);
  assert.match(plan(read.queries[0]),/idx_comments_lounge_public_order \(target_id=\? AND status=\?\)/);
  assert(!plan(read.queries[0]).includes('TEMP B-TREE'));
  assert.equal(read.queries[0].returned,1);
});

test('related fallbacks return only unfilled slots using ordered language/general indexes', async () => {
  db.sqlite.exec('DELETE FROM review_credits WHERE review_id=70');
  const read = await trace(() => listRelatedReviews({id:70,slug:'review-70',language:'tElUgU'},3));
  assert.deepEqual(read.value.map(({ id }) => id),[2998,2996,2994]);
  const fallback = read.queries.find(({ sql }) => sql.includes('id NOT IN'));
  assert.equal(fallback.returned,3);
  assert.equal(fallback.args.at(-1),3);
  assert.match(plan(fallback),/idx_reviews_status_language_reviewed_date \(status=\? AND language=\?\)/);
  assert(!plan(fallback).includes('TEMP B-TREE'));
  const general = await trace(() => reviews.listRecentRelatedReviews({excludeIds:[70,2998,2997],limit:1}));
  assert.deepEqual(general.value.map(({ id }) => id),[2996]);
  assert.match(plan(general.queries[0]),/idx_reviews_status_reviewed_date \(status=\?\)/);
  assert.equal(general.queries[0].returned,1);
  assert(!plan(general.queries[0]).includes('TEMP B-TREE'));
});

test('targeted-read indexes can be applied again without modifying review or engagement data', () => {
  const before = db.sqlite.prepare('SELECT COUNT(*) AS n FROM reviews').get();
  const commentsBefore = db.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get();
  db.sqlite.exec(readFileSync('migrations/0008_targeted_review_reads.sql','utf8'));
  assert.deepEqual(db.sqlite.prepare('SELECT COUNT(*) AS n FROM reviews').get(),before);
  assert.deepEqual(db.sqlite.prepare('SELECT COUNT(*) AS n FROM comments').get(),commentsBefore);
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});
