import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const FREE_LIMITS = { rowsRead: 5_000_000, rowsWritten: 100_000 };
const DATABASE_ID = '6c88b16c-c302-47cf-92cd-bdc5f8470bc2';
const FIELDS = ['rowsRead', 'rowsWritten', 'readQueries', 'writeQueries'];
const DAY = 86_400_000;

export function queryWindow(now) {
  const midnight = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  return {
    since: new Date(midnight - 3 * DAY).toISOString().slice(0, 10),
    until: new Date(midnight).toISOString().slice(0, 10),
    nextResetUtc: new Date(midnight + DAY).toISOString(),
  };
}

function parseDays(groups) {
  if (!Array.isArray(groups)) throw new Error('Analytics dataset unavailable; usage is unknown.');
  const dates = new Set();
  return groups.map(group => {
    const date = group?.dimensions?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || dates.has(date)) {
      throw new Error('Invalid or duplicate analytics date; usage is unknown.');
    }
    dates.add(date);
    const day = { date };
    for (const field of FIELDS) {
      const value = group?.sum?.[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Missing or invalid ${field}; usage is unknown.`);
      }
      day[field] = value;
    }
    return day;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildReport(payload, now = new Date()) {
  if (payload.errors?.length) throw new Error(`Cloudflare analytics: ${payload.errors.map(e => e.message).join('; ')}`);
  const accounts = payload?.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new Error('Cloudflare account analytics access was not confirmed.');
  }
  const window = queryWindow(now);
  const accountDays = parseDays(accounts[0].accountDays);
  const siteDays = parseDays(accounts[0].siteDays);
  const today = accountDays.find(day => day.date === window.until);
  const quota = today ? Object.fromEntries(Object.entries(FREE_LIMITS).map(([field, limit]) => {
    const used = today[field];
    return [field, {
      used, limit, remaining: Math.max(0, limit - used),
      percent: Number((100 * used / limit).toFixed(2)),
      level: used >= limit ? 'at_or_above_limit' : used >= limit * 0.8 ? 'near_limit' : 'below_warning_threshold',
    }];
  })) : null;
  return {
    version: 1, fetchedAtUtc: now.toISOString(), source: 'Cloudflare GraphQL Analytics',
    site: 'moviereviewbypoorna.com', database: 'movie-review-by-poorna-content',
    quotaScope: 'All D1 databases in the Cloudflare account; daily UTC window',
    ...window, quota, accountDays, siteDays,
    notes: [
      'Read-only analytics fetch; no site page requests or SQL queries.',
      'An absent daily record means no data was reported, not confirmed zero usage.',
      'Analytics may lag or be sampled; this report does not prove live availability.',
      'Compare completed UTC days or matching elapsed periods; today is incomplete.',
      'Warnings do not change the plan or deploy code.',
    ],
  };
}

export async function collectReport({ token, accountId, now = new Date(), fetcher = fetch }) {
  if (!token?.trim()) throw new Error('Missing GitHub secret CLOUDFLARE_ANALYTICS_API_TOKEN.');
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '')) throw new Error('Missing or invalid GitHub secret CLOUDFLARE_ACCOUNT_ID.');
  const { since, until } = queryWindow(now);
  const query = `query Usage($account: string!, $since: Date!, $until: Date!, $database: string!) {
    viewer { accounts(filter: {accountTag: $account}) {
      accountDays: d1AnalyticsAdaptiveGroups(limit: 8, filter: {date_geq: $since, date_leq: $until}, orderBy: [date_ASC]) {
        dimensions { date }
        sum { rowsRead rowsWritten readQueries writeQueries }
      }
      siteDays: d1AnalyticsAdaptiveGroups(limit: 8, filter: {date_geq: $since, date_leq: $until, databaseId: $database}, orderBy: [date_ASC]) {
        dimensions { date }
        sum { rowsRead rowsWritten readQueries writeQueries }
      }
    } }
  }`;
  const response = await fetcher('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', redirect: 'error',
    headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { account: accountId, since, until, database: DATABASE_ID } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Cloudflare analytics HTTP ${response.status}; no usage report was produced.`);
  return buildReport(await response.json(), now);
}

export function markdownReport(report) {
  const lines = ['## Cloudflare free-quota report', '', `Fetched: ${report.fetchedAtUtc}`, '',
    '| UTC day | Scope | Rows read | Rows written | Read queries | Write queries |',
    '| --- | --- | ---: | ---: | ---: | ---: |'];
  for (const [scope, days] of [['Account', report.accountDays], ['Movie review database', report.siteDays]]) {
    for (const day of days) lines.push(`| ${day.date} | ${scope} | ${FIELDS.map(field => day[field].toLocaleString('en-US')).join(' | ')} |`);
  }
  lines.push('', report.quota
    ? `Today: **${report.quota.rowsRead.percent}%** of the read allowance; **${report.quota.rowsWritten.percent}%** of the write allowance.`
    : 'No current-day record is available; current quota usage is unknown.',
  '', `Next reset: ${report.nextResetUtc} (05:30 IST).`, '', ...report.notes.map(note => `- ${note}`), '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await collectReport({
      token: process.env.CLOUDFLARE_ANALYTICS_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    });
    console.log(`CLOUDFLARE_USAGE_REPORT ${JSON.stringify(report)}`);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReport(report));
  } catch (error) {
    let message = String(error.message);
    for (const value of [process.env.CLOUDFLARE_ANALYTICS_API_TOKEN, process.env.CLOUDFLARE_ACCOUNT_ID]) {
      if (value) message = message.replaceAll(value, '[redacted]');
    }
    console.error(`Monitoring failed: ${message.slice(0, 500)}`);
    process.exitCode = 1;
  }
}
