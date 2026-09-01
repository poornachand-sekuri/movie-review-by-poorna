import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const isWorkersBuild = process.env.WORKERS_CI === '1';
const branch = process.env.WORKERS_CI_BRANCH || '';
const marker = '.validation-preview-deployed';

if (!isWorkersBuild || branch !== 'optimization-preview') {
  process.exit(0);
}

if (existsSync(marker)) {
  console.log('Validation Worker already deployed in this build workspace.');
  process.exit(0);
}

console.log('Deploying isolated validation Worker: movie-review-by-poorna-validation');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'deploy:validation'], {
  stdio: 'inherit',
  env: process.env
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(marker, `${process.env.WORKERS_CI_COMMIT_SHA || 'unknown'}\n`);
