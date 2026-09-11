import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';
import { measureReads } from '../scripts/check-d1-reads.mjs';
import { migrationConfig, totalsMismatchSql } from '../scripts/apply-read-efficiency.mjs';

test('deployment probes preserve sampled results, use read-only SQL and measure returned D1 metadata', async () => {
  const db = createD1();
  const samples = Array.from({ length: 6 }, (_, i) => ({ id: i+1, slug: `movie-${i+1}` }));
  for (const { id, slug } of samples) {
    db.sqlite.prepare("INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES(?,?,'Movie','2026-09-01','Body','published')").run(id, slug);
    db.sqlite.prepare('INSERT INTO legacy_reaction_imports(review_id,source_slug,source_votes) VALUES(?,?,0)').run(id, slug);
    db.sqlite.prepare("INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(?,'a','like'),(?,'b','dislike')").run(id,id);
  }
  db.sqlite.exec("INSERT INTO comments(target_type,target_id,review_id,author_name,body,status) VALUES('review','movie-1',1,'A','Comment','approved')");
  const query = async (sql, params = []) => {
    assert(/^\s*SELECT\b/i.test(sql));
    const values = Object.fromEntries(params.map((value,index) => [String(index+1), value]));
    // Synthetic metadata tests summing only; it does not estimate billable rows.
    return { results: db.sqlite.prepare(sql).all(values), meta: { rows_read: 7, rows_written: 0 } };
  };
  const before = await measureReads(query, samples, 'before');
  const after = await measureReads(query, samples, 'after');
  assert.deepEqual(after.cases.map(c => c.fingerprint), before.cases.map(c => c.fingerprint));
  assert.equal(before.cases.find(c => c.name.startsWith('Cafe')).statements, 18);
  assert.equal(after.cases.find(c => c.name.startsWith('Cafe')).statements, 3);
  assert(after.cases.every(c => c.rowsRead === c.statements * 7));
  assert.equal(db.sqlite.prepare(totalsMismatchSql).get().mismatches, 0);
  db.sqlite.exec('UPDATE review_reaction_totals SET likes=7 WHERE review_id=1');
  assert.equal(db.sqlite.prepare(totalsMismatchSql).get().mismatches, 1, 'deployment gate catches a broken backfill');
  db.sqlite.close();
});

test('migration preparation retains the selected database and standard migration history', () => {
  for (const target of ['wrangler.jsonc', 'wrangler.preview.jsonc']) {
    const source = JSON.parse(readFileSync(target, 'utf8'));
    const binding = source.d1_databases.find(db => db.binding === 'CONTENT_DB');
    const config = migrationConfig(source, binding);
    assert.equal(config.d1_databases[0].database_id, binding.database_id);
    assert.equal(config.d1_databases[0].migrations_dir, 'migrations');
    assert.equal(config.d1_databases[0].migrations_table, binding.migrations_table);
  }
});
