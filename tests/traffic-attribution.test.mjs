import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('page analytics captures source, campaign and landing page without third-party SDKs', async () => {
  const client = await read('src/lib/analytics-client.ts');
  assert.match(client, /utm_source/);
  assert.match(client, /utm_campaign/);
  assert.match(client, /sessionStorage/);
  assert.match(client, /trafficSource/);
  assert.match(client, /sourceFromReferrer/);
  assert.doesNotMatch(client, /google-analytics|gtag\(|facebook\.net\/.*sdk/i);
});

test('social follow and review share actions are first-party analytics events', async () => {
  const stayConnected = await read('src/components/StayConnected.astro');
  const sharing = await read('src/lib/auditorium-sharing.ts');
  assert.match(stayConnected, /social_follow_click/);
  assert.match(stayConnected, /data-social-platform="instagram"/);
  assert.match(stayConnected, /data-social-platform="whatsapp"/);
  assert.match(sharing, /review_share_click/);
  assert.match(sharing, /utm_medium/);
  assert.match(sharing, /utm_campaign/);
});

test('Projector Room exposes traffic source and social action metrics', async () => {
  const data = await read('src/lib/data/analytics.ts');
  const dashboard = await read('public/admin/admin-traffic.js');
  assert.match(data, /trafficSources/);
  assert.match(data, /landingPagesBySource/);
  assert.match(data, /topReviewsBySource/);
  assert.match(data, /socialEventTotals/);
  assert.match(dashboard, /Traffic Sources/);
  assert.match(dashboard, /Social Actions/);
  assert.match(dashboard, /Top Landing Pages by Source/);
});
