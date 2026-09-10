import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReport, collectReport, queryWindow } from '../scripts/cloudflare-usage-monitor.mjs';

const now = new Date('2026-09-10T19:30:00Z'); // September 11 in India; quota is still September 10.
const day = (date, reads, writes = 100) => ({ dimensions: { date }, sum: { rowsRead: reads, rowsWritten: writes, readQueries: 10, writeQueries: 1 } });
const payload = (accountDays, siteDays = []) => ({ data: { viewer: { accounts: [{ accountDays, siteDays }] } } });

test('quota follows UTC and includes other databases in the same account', () => {
  const report = buildReport(payload([day('2026-09-10', 4_500_000)], [day('2026-09-10', 1_000_000)]), now);
  assert.equal(report.until, '2026-09-10');
  assert.equal(report.nextResetUtc, '2026-09-11T00:00:00.000Z');
  assert.equal(report.quota.rowsRead.percent, 90);
  assert.equal(report.quota.rowsRead.remaining, 500_000);
  assert.equal(report.quota.rowsRead.level, 'near_limit');
  assert.equal(queryWindow(new Date('2026-09-11T00:00:00Z')).until, '2026-09-11');
});

test('exceeded read/write allowance remains visible instead of being capped at 100%', () => {
  const report = buildReport(payload([day('2026-09-10', 5_100_000, 110_000)]), now);
  assert.equal(report.quota.rowsRead.percent, 102);
  assert.equal(report.quota.rowsWritten.level, 'at_or_above_limit');
  assert.equal(report.quota.rowsWritten.remaining, 0);
});

test('missing data, malformed metrics and denied access never become a false zero-usage report', () => {
  assert.equal(buildReport(payload([]), now).quota, null);
  assert.throws(() => buildReport(payload(null), now));
  assert.throws(() => buildReport(payload([{ dimensions: { date: '2026-09-10' }, sum: {} }]), now));
  assert.throws(() => buildReport({ errors: [{ message: 'Not authorized' }] }, now), /Not authorized/);
  assert.throws(() => buildReport({ data: { viewer: { accounts: [] } } }, now));
});

test('fetch uses exactly one analytics request and rejects HTTP errors', async () => {
  let calls = 0;
  const options = { token: 'test-token', accountId: 'a'.repeat(32), now };
  const report = await collectReport({ ...options, fetcher: async (url, request) => {
    calls++;
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    assert.equal(request.headers.Authorization, 'Bearer test-token');
    const { variables } = JSON.parse(request.body);
    assert.deepEqual([variables.since, variables.until], ['2026-09-07', '2026-09-10']);
    return { ok: true, json: async () => payload([day('2026-09-10', 100)]) };
  } });
  assert.equal(calls, 1);
  assert.equal(report.quota.rowsRead.used, 100);
  await assert.rejects(collectReport({ ...options, fetcher: async () => ({ ok: false, status: 403 }) }), /HTTP 403/);
  await assert.rejects(collectReport({ ...options, token: '' }), /Missing GitHub secret/);
});
