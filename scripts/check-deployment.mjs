import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';

// Routine deployment verification has a fixed request budget. Full audits and
// temporary vote writes remain available only as explicitly selected diagnostics.
export async function checkDeployment(base, target, fetchImpl = fetch) {
  assert(['preview', 'production'].includes(target), 'Choose preview or production.');
  const origin = new URL(base).origin;
  const read = async path => {
    const response = await fetchImpl(new URL(path, origin), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { accept: 'application/json' },
    });
    assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
    return response.json();
  };
  const health = await read('/api/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'movie-review-by-poorna');
  assert.equal(health.environment, target, 'Wrong deployment environment.');
  const catalogue = await read('/api/reviews?limit=1');
  assert(Array.isArray(catalogue.items) && catalogue.items.length === 1, 'Expected one published review.');
  assert(typeof catalogue.items[0].slug === 'string' && catalogue.items[0].slug.length > 0);
  assert(!Object.hasOwn(catalogue.items[0], 'bodyHtml'), 'Summary must exclude the full review body.');
  return { target, requests: 2, databaseBackedRequests: 1, status: 'passed' };
}

if (import.meta.main) {
  const [base, target] = process.argv.slice(2);
  assert(base, 'Usage: node scripts/check-deployment.mjs <url> <preview|production>');
  const result = await checkDeployment(base, target);
  console.log(JSON.stringify(result));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Deployment check: ${target} passed. Two GET requests: service health and one compact review. No retries or test votes. This checks basic service/database access, not every page or interaction.\n`);
}
