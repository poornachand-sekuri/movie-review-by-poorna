import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { remoteD1 } from './d1-read-client.mjs';

export const migration = '0009_go_live_engagement_reset.sql';

export const resetVerificationSql = `SELECT
  (SELECT COUNT(*) FROM page_views) AS views,
  (SELECT COUNT(*) FROM comments) AS comments,
  (SELECT COUNT(*) FROM legacy_comment_imports) AS legacy_comment_imports,
  (SELECT COUNT(*) FROM review_reaction_votes) AS votes,
  (SELECT COALESCE(SUM(likes), 0) FROM review_reaction_totals) AS likes,
  (SELECT COALESCE(SUM(dislikes), 0) FROM review_reaction_totals) AS dislikes,
  (SELECT COUNT(*) FROM reviews) AS reviews,
  (SELECT COUNT(*) FROM legacy_reaction_imports) AS legacy_markers,
  (SELECT COUNT(*) FROM legacy_reaction_imports WHERE source_votes = 0) AS zero_legacy_markers`;

function migrationConfig(config, binding) {
  return {
    name: config.name,
    compatibility_date: config.compatibility_date,
    d1_databases: [{ ...binding, migrations_dir: 'migrations' }],
  };
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], {
    stdio: ['pipe', 'inherit', 'inherit'],
    input: 'y\n',
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Cloudflare go-live reset failed.');
}

async function apply(target) {
  assert.equal(target, 'production', 'The go-live engagement reset is production-only.');
  const { config, binding, query } = remoteD1(target);
  const tables = new Set((await query("SELECT name FROM sqlite_master WHERE type = 'table'")).results.map(row => row.name));
  for (const name of [
    'reviews',
    'legacy_import_audit',
    'legacy_reaction_imports',
    'review_reaction_votes',
    'review_reaction_totals',
    'comments',
    'legacy_comment_imports',
    'page_views',
    'analytics_revision',
    'd1_migrations',
  ]) {
    assert(tables.has(name), `Missing prerequisite table ${name}; reset stopped.`);
  }

  const applied = await query('SELECT name FROM d1_migrations WHERE name = ?1', [migration]);
  if (applied.results.length) {
    console.log(`${migration} is already applied; no engagement data was changed.`);
    return;
  }

  const readEfficiency = await query("SELECT name FROM d1_migrations WHERE name = '0008_read_efficiency.sql'");
  assert.equal(readEfficiency.results.length, 1, 'Migration 0008 must be applied before the go-live reset.');

  const before = await query(`SELECT
    (SELECT COUNT(*) FROM page_views) AS views,
    (SELECT COUNT(*) FROM comments) AS comments,
    (SELECT COUNT(*) FROM review_reaction_votes) AS votes,
    (SELECT COALESCE(SUM(likes), 0) FROM review_reaction_totals) AS likes,
    (SELECT COALESCE(SUM(dislikes), 0) FROM review_reaction_totals) AS dislikes`);
  console.log('Pre-reset engagement snapshot:', JSON.stringify(before.results[0]));

  // Capture Cloudflare's restore bookmark before making the destructive change.
  runWrangler(['d1', 'time-travel', 'info', binding.database_name, '--config', 'wrangler.jsonc', '--json']);

  const temporary = mkdtempSync(join(tmpdir(), 'mrp-go-live-reset-'));
  try {
    mkdirSync(join(temporary, 'migrations'));
    cpSync(join('migrations', migration), join(temporary, 'migrations', migration));
    const configPath = join(temporary, 'wrangler.json');
    writeFileSync(configPath, JSON.stringify(migrationConfig(config, binding)));
    runWrangler(['d1', 'migrations', 'apply', binding.database_name, '--remote', '--config', configPath]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  const marker = await query('SELECT name FROM d1_migrations WHERE name = ?1', [migration]);
  assert.equal(marker.results.length, 1, 'Go-live reset migration was not recorded as applied.');

  const verification = (await query(resetVerificationSql)).results[0];
  for (const field of ['views', 'comments', 'legacy_comment_imports', 'votes', 'likes', 'dislikes']) {
    assert.equal(Number(verification[field]), 0, `${field} did not reset to zero.`);
  }
  assert.equal(Number(verification.legacy_markers), Number(verification.reviews), 'Every existing review must block legacy vote re-import.');
  assert.equal(Number(verification.zero_legacy_markers), Number(verification.reviews), 'Legacy vote markers must all be zeroed.');
  console.log('Go-live engagement reset verified:', JSON.stringify(verification));
}

if (import.meta.main) await apply(process.argv[2] ?? 'production');
