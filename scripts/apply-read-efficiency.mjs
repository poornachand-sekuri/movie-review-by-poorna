import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { remoteD1 } from './d1-read-client.mjs';

export const migration = '0008_read_efficiency.sql';
export const totalsMismatchSql = `SELECT COUNT(*) AS mismatches FROM (
  SELECT r.id FROM reviews r LEFT JOIN review_reaction_totals t ON t.review_id = r.id
  LEFT JOIN review_reaction_votes v ON v.review_id = r.id GROUP BY r.id
  HAVING COALESCE(t.likes, 0) <> COALESCE(SUM(v.reaction = 'like'), 0)
    OR COALESCE(t.dislikes, 0) <> COALESCE(SUM(v.reaction = 'dislike'), 0)
)`;

export function migrationConfig(config, binding) {
  // Copy only the explicitly authorized migration. Never replay untracked historical migrations.
  return { name: config.name, compatibility_date: config.compatibility_date,
    d1_databases: [{ ...binding, migrations_dir: 'migrations' }] };
}

async function apply(target) {
  const { config, binding, query } = remoteD1(target);
  const tables = new Set((await query("SELECT name FROM sqlite_master WHERE type = 'table'")).results.map(r => r.name));
  for (const name of ['reviews', 'comments', 'page_views', 'review_reaction_votes', 'legacy_reaction_imports']) {
    assert(tables.has(name), `Missing prerequisite table ${name}; stop and inspect migration history.`);
  }
  if (tables.has('d1_migrations')) {
    const applied = await query('SELECT name FROM d1_migrations WHERE name = ?1', [migration]);
    if (applied.results.length) {
      assert.equal((await query('SELECT version FROM analytics_revision WHERE id = 1')).results.length, 1);
      console.log(`${migration} is already applied.`);
      return;
    }
  }
  const wrangler = (args) => {
    const result = spawnSync(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), ...args], {
      stdio: ['pipe', 'inherit', 'inherit'], input: 'y\n', env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Cloudflare database preparation failed; Worker deployment stopped.');
  };
  // Capture a restore bookmark before the additive migration. No restore is performed automatically.
  wrangler(['d1', 'time-travel', 'info', binding.database_name, '--config', target === 'preview' ? 'wrangler.preview.jsonc' : 'wrangler.jsonc', '--json']);
  const temporary = mkdtempSync(join(tmpdir(), 'mrp-migration-'));
  try {
    mkdirSync(join(temporary, 'migrations'));
    cpSync(join('migrations', migration), join(temporary, 'migrations', migration));
    const configPath = join(temporary, 'wrangler.json');
    writeFileSync(configPath, JSON.stringify(migrationConfig(config, binding)));
    wrangler(['d1', 'migrations', 'apply', binding.database_name, '--remote', '--config', configPath]);
    assert.equal((await query('SELECT name FROM d1_migrations WHERE name = ?1', [migration])).results.length, 1);
    assert.equal((await query(totalsMismatchSql)).results[0].mismatches, 0, 'Vote totals differ from canonical votes; do not deploy.');
    assert.equal((await query('SELECT version FROM analytics_revision WHERE id = 1')).results.length, 1);
    console.log(`${migration} applied; historical votes and derived totals agree.`);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (import.meta.main) await apply(process.argv[2] ?? 'production');
