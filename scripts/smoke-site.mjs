import { smokeReactions } from './smoke-reactions.mjs';
import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const [base, target] = process.argv.slice(2);
assert(base && ['preview', 'production'].includes(target), 'Usage: npm run smoke -- <url> <preview|production>');
const origin = new URL(base).origin;

async function request(path, { status = 200, ...options } = {}) {
  const url = new URL(path, origin);
  let failure;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      assert([status].flat().includes(response.status), `${url.pathname}: HTTP ${response.status}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 9) await delay(2000);
    }
  }
  throw failure;
}

const [lounge, cafe, review, admin, session, health, list, detail, search] = await Promise.all([
  request('/').then((response) => response.text()),
  request('/search?q=Kantara').then((response) => response.text()),
  request('/review/dc').then((response) => response.text()),
  request('/admin/').then((response) => response.text()),
  request('/api/admin/session', { status: 401 }).then((response) => response.json()),
  request('/api/health').then((response) => response.json()),
  request('/api/reviews?limit=5').then((response) => response.json()),
  request('/api/reviews/dc').then((response) => response.json()),
  request('/api/search?q=Kantara&limit=5').then((response) => response.json()),
]);
assert.equal(health.status, 'ok');
assert.equal(session.authenticated, false);
assert(Array.isArray(list.items) && list.items.length === 5, 'Compact list must return five reviews.');
assert(!Object.hasOwn(list.items[0], 'bodyHtml'), 'Compact list must exclude full bodies.');
assert.equal(detail.review?.slug, 'dc');
assert(typeof detail.review.bodyHtml === 'string' && detail.review.bodyHtml.length > 0);
assert(Array.isArray(detail.review.credits));
assert(search.items?.some((item) => item.slug === 'kantara-chapter-1'), 'Full-text search must find Kantara.');

const count = (html, token) => html.split(token).length - 1;
for (const token of ['Movie Reviews By Poorna', 'lounge-stage', 'data-lounge-loader',
  'Getting the lounge ready for your grand entrance', '02_Movie_Reviews_By_Poorna_Banner_runtime_q99.webp',
  'lounge-panel--now', 'lounge-panel--recent', 'lounge-panel--previous', 'lounge-panel--opinion']) {
  assert(lounge.includes(token), `Lounge missing ${token}`);
}
assert.equal(count(lounge, 'class="recent-card '), 8);
assert.equal(count(lounge, 'class="previous-card '), 8);
for (const token of ['data-review-carousel', 'data-carousel-next', 'data-carousel-prev']) {
  assert.equal(count(lounge, token), 2, `Lounge missing ${token}`);
}
assert.equal(lounge.includes('name="robots" content="noindex,nofollow"'), target === 'preview', 'Wrong indexing policy.');
assert(cafe.includes('Kantara'), 'Café catalogue is missing.');
assert(review.includes('The Auditorium') && review.includes('DC'), 'Auditorium review missing.');
assert(admin.includes('The Projector Room') && admin.includes('ENTER PROJECTOR ROOM'), 'Admin login missing.');
for (const token of ['Audience Dashboard', 'Manage Reviews', 'id="adminView"']) {
  assert(!admin.includes(token), `Unauthenticated page leaked ${token}`);
}

const artwork = [
  '01_Movie_Reviews_By_Poorna_Premier_Lounge_Background', '02_Movie_Reviews_By_Poorna_Banner',
  '03_Now_Reviewed_Panel', '04_Recent_Reviews_Panel', '05_Previously_Reviewed_Panel',
  '06_Share_Your_Opinion_Panel', '07_Lounge_Cini_Cafe_Banner',
  '08_Now_Reviewed_With_Exit', '09_Share_Your_Opinion_With_Exit',
];
for (const name of artwork) {
  const url = `https://assets.moviereviewbypoorna.com/ui/pages/home/v4/res%70onsive/${name}_runtime_q99.webp?verify=${process.env.GITHUB_SHA ?? 'smoke'}`;
  // Some R2 paths ignore Range and return 200; both statuses are valid.
  const response = await request(url, { headers: { range: 'bytes=0-31' }, status: [200, 206] });
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.subarray(0, 4).equals(Buffer.from('RIFF')) && bytes.subarray(8, 12).equals(Buffer.from('WEBP')), `Invalid artwork: ${name}`);
}
await smokeReactions(origin);
console.log(`Passed: all four pages, auth boundary, APIs, indexing and artwork at ${origin}`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `Validated ${target}: [Lounge](${origin}/) · [Auditorium](${origin}/review/dc) · [Café](${origin}/search) · [Projector Room](${origin}/admin/)\n\nCommit: ${process.env.GITHUB_SHA}\n`);
}
