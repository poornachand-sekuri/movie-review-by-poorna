import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
const prepare = db.prepare.bind(db);
const lookupPlans = [];
db.prepare = (sql) => {
  const statement = prepare(sql);
  if (sql.includes('FROM reviews r')) {
    const bind = statement.bind;
    let values = {};
    statement.bind = function (...args) {
      values = Object.fromEntries(args.map((value, index) => [String(index + 1), value]));
      return bind.apply(this, args);
    };
    const run = statement.run;
    statement.run = async function () {
      lookupPlans.push(db.sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(values).map(row => row.detail));
      return run.call(this);
    };
  }
  return statement;
};

const sourceReads = [];
installBindings({ CONTENT_DB: db, LEGACY_REACTIONS: { getByName(slug) {
  return { async exportVotes() {
    sourceReads.push(slug);
    return slug === 'original-title' ? [{ voter_key: 'reader', vote: 'like', updated_at: '2026-09-01T00:00:00Z' }] : [];
  } };
} } });
const { importLegacyReactions } = await import('../src/lib/data/legacy-reactions.ts');

db.sqlite.exec(`
  WITH RECURSIVE n(id) AS (VALUES(1) UNION ALL SELECT id + 1 FROM n WHERE id < 137)
  INSERT INTO reviews(id, slug, title, reviewed_date, status)
  SELECT id, 'review-' || id, 'Review ' || id, '2026-09-10', 'published' FROM n;
  INSERT INTO legacy_import_audit(review_id, source_sha256, source_json)
  VALUES(70, 'fixture', '{"s":"original-title"}');
  INSERT INTO reviews(id, slug, title, reviewed_date, status)
  VALUES(138, 'draft', 'Draft', '2026-09-10', 'draft');
`);

test('single-review import uses its primary key and preserves the original title and vote', async () => {
  await importLegacyReactions(70);
  assert.match(lookupPlans.at(-1)[0], /SEARCH r USING INTEGER PRIMARY KEY/,
    'a per-review poll must not search all published reviews');
  assert.deepEqual(sourceReads, ['original-title']);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM legacy_reaction_imports').get().n, 1);
  const vote = db.sqlite.prepare('SELECT review_id, voter_key, reaction FROM review_reaction_votes').get();
  assert.deepEqual({ ...vote }, { review_id: 70, voter_key: 'reader', reaction: 'like' });

  await importLegacyReactions(70);
  assert.match(lookupPlans.at(-1)[0], /SEARCH r USING INTEGER PRIMARY KEY/);
  assert.deepEqual(sourceReads, ['original-title'], 'completed imports do not re-read the source');
  await importLegacyReactions(138);
  await importLegacyReactions(999);
  assert.deepEqual(sourceReads, ['original-title'], 'draft and missing reviews are not imported');
});

test('catalogue import still discovers every remaining published review exactly once', async () => {
  await importLegacyReactions();
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM legacy_reaction_imports').get().n, 137);
  assert.equal(sourceReads.length, 137);
  assert.equal(new Set(sourceReads).size, 137);
  assert(!sourceReads.includes('draft'));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_reaction_votes').get().n, 1);
  await importLegacyReactions();
  assert.equal(sourceReads.length, 137, 'a repeated catalogue check does not duplicate source reads');
});
