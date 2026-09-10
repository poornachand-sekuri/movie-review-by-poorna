import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [target, action] = process.argv.slice(2);
assert(['production', 'preview'].includes(target), 'Choose production or preview explicitly.');
assert(['build', 'deploy', 'dry-run'].includes(action), 'Choose build, deploy or dry-run.');
const root = fileURLToPath(new URL('../', import.meta.url));
const config = target === 'preview' ? 'wrangler.preview.jsonc' : 'wrangler.jsonc';
const expected = JSON.parse(readFileSync(resolve(root, config), 'utf8'));
const expectedName = target === 'preview' ? 'movie-review-by-poorna-preview' : 'movie-review-by-poorna';
assert.equal(expected.name, expectedName, 'Source configuration targets the wrong Worker.');

function run(binary, args) {
  const result = spawnSync(process.execPath, [resolve(root, binary), ...args], {
    cwd: root,
    env: { ...process.env, MRP_DEPLOY_TARGET: target },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === 'build') {
  run('node_modules/wrangler/bin/wrangler.js', ['types', '--config', config]);
  run('node_modules/astro/bin/astro.mjs', ['build']);
}

// Always deploy the compiled Astro Worker, and refuse a stale build for another target.
const bundledPath = resolve(root, 'dist/server/wrangler.json');
const bundled = JSON.parse(readFileSync(bundledPath, 'utf8'));
assert.equal(bundled.name, expectedName, `Build ${target} before ${action}.`);
assert.deepEqual(bundled.d1_databases?.map(({ binding, database_id }) => ({ binding, database_id })),
  expected.d1_databases.map(({ binding, database_id }) => ({ binding, database_id })));
assert.deepEqual(bundled.durable_objects, expected.durable_objects, 'Compiled legacy reaction binding must match the source.');
if (action !== 'build') {
  if (action === 'deploy') run('scripts/apply-read-efficiency.mjs', [target]);
  run('node_modules/wrangler/bin/wrangler.js', [
    'deploy', '--config', bundledPath, ...(action === 'dry-run' ? ['--dry-run'] : []),
  ]);
}
