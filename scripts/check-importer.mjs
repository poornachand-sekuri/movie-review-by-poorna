import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const [reviewsPath, creditsPath] = process.argv.slice(2);
assert(reviewsPath && creditsPath, 'Supply reviews and credits JSON paths.');
const directory = mkdtempSync(join(tmpdir(), 'cinema-import-'));
const db = new DatabaseSync(':memory:');
try {
  const seed = join(directory, 'seed.sql');
  execFileSync(process.execPath, ['scripts/build-legacy-seed.mjs', reviewsPath, creditsPath, seed]);
  for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join('migrations', file), 'utf8'));
  }
  db.exec(readFileSync(seed, 'utf8'));
  const reviews = JSON.parse(readFileSync(reviewsPath, 'utf8'));
  const credits = JSON.parse(readFileSync(creditsPath, 'utf8'));
  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  assert.equal(count('reviews'), reviews.length);
  assert.equal(count('legacy_import_audit'), reviews.length);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT lower(slug)) AS n FROM reviews').get().n, reviews.length);
  assert.equal(count('review_gallery'), reviews.reduce((n, review) => n + (review.gallery?.length ?? 0), 0));
  assert.equal(count('review_credits'), Object.values(credits.records ?? {}).reduce((n, groups) =>
    n + (Array.isArray(groups) ? groups.reduce((total, names) => total + (Array.isArray(names) ? names.filter(Boolean).length : 0), 0) : 0), 0));
  // The fixture contains this word in searchable content, proving the FTS triggers/import.
  if (reviewsPath === 'tests/fixtures/reviews.json') {
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM review_search WHERE review_search MATCH 'schema'").get().n, 1);
  }
  assert.equal(Object.values(db.prepare('PRAGMA integrity_check').get())[0], 'ok');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  console.log(`Validated all migrations and import: ${reviews.length} reviews, ${count('review_credits')} credits, ${count('review_gallery')} gallery images.`);
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
