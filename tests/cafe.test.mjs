import assert from 'node:assert/strict';
import test from 'node:test';
import { createCafeFilter, yearOf } from '../src/lib/cini-cafe-filter.ts';

const catalogue = [
  { id: 1, title: 'Beta', language: 'Telugu', releaseDate: '2024-05-01', reviewedDate: '2026-01-01', searchTerms: ['Director One'], likes: 2 },
  { id: 2, title: 'Alpha', language: 'Tamil', releaseDate: null, reviewedDate: '2025-05-01', searchTerms: ['Actor Two'], likes: 0 },
  { id: 3, title: 'Gamma', language: 'Telugu', releaseDate: '2024-05-01', reviewedDate: '2026-02-01', searchTerms: [], likes: 4 },
];
const defaults = { query: '', language: '', year: '', sort: 'latest' };
const filter = createCafeFilter(catalogue);
const ids = (filters) => filter({ ...defaults, ...filters }).map((review) => review.id);

test('Café sorting keeps release-date precedence, reviewed-date fallback and ID ties', () => {
  assert.deepEqual(ids({}), [2, 3, 1]);
  assert.deepEqual(ids({ sort: 'oldest' }), [1, 3, 2]);
  assert.deepEqual(ids({ sort: 'title-az' }), [2, 1, 3]);
  assert.deepEqual(ids({ sort: 'title-za' }), [3, 1, 2]);
  assert.equal(yearOf(catalogue[1]), '2025');
});

test('Café combines title/credit search with exact language and year filters', () => {
  assert.deepEqual(ids({ query: ' DIRECTOR one ', language: 'Telugu', year: '2024' }), [1]);
  assert.deepEqual(ids({ query: 'actor two' }), [2]);
  assert.deepEqual(ids({ query: 'telugu', year: '2024' }), [3, 1]);
  assert.deepEqual(ids({ query: 'no match' }), []);
});

test('Pagination reuses results without re-indexing; live likes remain updatable', () => {
  let reads = 0;
  const item = { ...catalogue[0], get searchTerms() { reads++; return ['Director One']; } };
  const select = createCafeFilter([item]);
  const first = select(defaults);
  const second = select({ ...defaults, page: 2 });
  assert.equal(first, second);
  item.likes = 10;
  assert.equal(second[0].likes, 10);
  select({ ...defaults, query: 'director' });
  assert.equal(reads, 1);
});

test('shared server/browser cards escape content and keep accessible links', async () => {
  const { installBindings } = await import('./helpers/d1.mjs');
  installBindings({});
  const { renderCafeCard } = await import('../src/lib/cini-cafe-card.ts');
  const html = renderCafeCard({ ...catalogue[0], slug: 'a/b', title: '<script>alert(1)</script>', posterUrl: 'https://example.com/a" onerror="bad()', rating: 4 }, 0);
  assert(!html.includes('<script>'));
  assert(html.includes('&lt;script&gt;'));
  assert(html.includes('href="/review/a%2Fb"'));
  assert(html.includes('a&quot; onerror=&quot;bad()'));
  assert(html.includes('loading="eager"'));
  assert(html.includes('★★★★☆'));
});
