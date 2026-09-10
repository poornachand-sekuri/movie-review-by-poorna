import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
const prepare = db.prepare.bind(db);
const plans = [];
db.prepare = (sql) => {
  const statement = prepare(sql);
  if (sql.includes('WITH current_credits')) {
    const bind = statement.bind;
    let values;
    statement.bind = function (...args) {
      values = Object.fromEntries(args.map((value, index) => [String(index + 1), value]));
      return bind.apply(this, args);
    };
    const run = statement.run;
    statement.run = async function () {
      plans.push(db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(values).map(({ detail }) => detail));
      return run.call(this);
    };
  }
  return statement;
};
installBindings({ CONTENT_DB: db });
const { listRelatedReviewsByCredits } = await import('../src/lib/data/reviews.ts');
const { listRelatedReviews } = await import('../src/lib/data/related-reviews.ts');

const insertReview = db.sqlite.prepare('INSERT INTO reviews(id,slug,title,reviewed_date,language,status) VALUES(?,?,?,?,?,?)');
for (const [id, date, language, status] of [
  [1, '2026-09-10', 'Telugu', 'published'],
  [2, '2026-08-01', 'Telugu', 'published'],
  [3, '2026-09-09', 'Telugu', 'published'],
  [4, '2026-09-08', 'Telugu', 'published'],
  [5, '2026-09-07', 'Telugu', 'published'],
  [6, '2026-09-06', 'Telugu', 'published'],
  [7, '2026-09-05', 'Telugu', 'published'],
  [8, '2026-09-10', 'Telugu', 'archived'],
  [9, '2026-09-10', 'Telugu', 'draft'],
  [10, '2026-08-02', 'Telugu', 'published'],
  [11, '2026-08-02', 'Telugu', 'published'],
  [12, '2026-09-04', 'Telugu', 'published'],
  [13, '2026-09-08', 'Hindi', 'published'],
  [14, '2026-09-01', 'Tamil', 'published'],
]) insertReview.run(id, `review-${id}`, `Review ${id}`, date, language, status);
for (let id = 15; id <= 137; id++) {
  insertReview.run(id, `review-${id}`, `Review ${id}`, '2020-01-01', 'Telugu', 'published');
}
for (const id of [10, 11, 20, 21, 30, 40]) {
  db.sqlite.prepare('INSERT INTO people(id,name) VALUES(?,?)').run(id, `Person ${id}`);
}
const credit = db.sqlite.prepare('INSERT INTO review_credits(review_id,person_id,role,position) VALUES(?,?,?,?)');
for (const args of [
  [1, 10, 'director', 0], [1, 11, 'director', 1],
  [1, 20, 'actor', 0], [1, 21, 'actor', 1],
  [1, 30, 'actress', 0], [1, 40, 'music_director', 0],
  [2, 10, 'director', 0], [3, 11, 'director', 0],
  [4, 20, 'actor', 0], [5, 30, 'actress', 0], [6, 40, 'music_director', 0],
  [7, 10, 'actor', 0], [8, 10, 'director', 0], [9, 10, 'director', 0],
  [10, 10, 'director', 0], [10, 20, 'actor', 0], [11, 10, 'director', 0],
]) credit.run(...args);

const ids = (rows) => rows.map(({ id }) => id);

test('related matches use candidate primary keys and preserve priority, dates, ties and uniqueness', async () => {
  assert.deepEqual(ids(await listRelatedReviewsByCredits(1)), [11, 10, 2, 3]);
  assert(plans.at(-1).some((detail) => /SEARCH r USING INTEGER PRIMARY KEY/.test(detail)),
    'matched review IDs must drive the final lookup');
  assert(!plans.at(-1).some((detail) => /SEARCH r USING INDEX idx_reviews_status/.test(detail)),
    'the final join must not visit every published review');
  assert.deepEqual(ids(await listRelatedReviewsByCredits(1, 2)), [11, 10]);
  assert.deepEqual(await listRelatedReviewsByCredits(0), []);
});

test('Related Reviews retains language and general-recency fallbacks when credits do not match', async () => {
  assert.deepEqual(ids(await listRelatedReviews({ id: 12, slug: 'review-12', language: 'Telugu' })), [1, 3, 4, 5]);
  assert.deepEqual(ids(await listRelatedReviews({ id: 14, slug: 'review-14', language: 'Tamil' })), [1, 3, 13, 4]);
});

test('archived matches disappear immediately and lower-priority cast and music matches remain ordered', async () => {
  db.sqlite.exec("UPDATE reviews SET status = 'archived' WHERE id IN (2,3,10,11)");
  assert.deepEqual(ids(await listRelatedReviewsByCredits(1)), [4, 5, 6]);
  assert.deepEqual(ids(await listRelatedReviews({ id: 1, slug: 'review-1', language: 'Telugu' })), [4, 5, 6, 7]);
  db.sqlite.exec("UPDATE reviews SET status = 'published' WHERE id IN (2,3,10,11)");
});
