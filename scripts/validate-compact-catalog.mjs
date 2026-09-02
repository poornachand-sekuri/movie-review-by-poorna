import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  COMPACT_REVIEW_FIELDS,
  compactReviews,
  contentPayload
} from '../src/review-catalog.js';

const full = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const compact = compactReviews(full);
const requested = full[Math.floor(full.length / 2)]?.s || '';
const content = contentPayload(full, requested);

assert(Array.isArray(full) && full.length > 0, 'The base review catalogue must be a non-empty array.');
assert.equal(compact.length, full.length, 'Compact catalogue must preserve every review.');

compact.forEach((review, index) => {
  assert.deepEqual(
    Object.keys(review),
    [...COMPACT_REVIEW_FIELDS],
    `Compact review ${index} has an unexpected field set or order.`
  );
  assert.equal(review.s, full[index].s, `Compact review ${index} changed review ordering.`);
  assert(!Object.hasOwn(review, 'body'), `Compact review ${index} leaked body HTML.`);
  assert(!Object.hasOwn(review, 'gallery'), `Compact review ${index} leaked gallery data.`);
});

assert.equal(content.reviews.length, full.length, 'Content payload must preserve every catalogue review.');
assert.equal(content.active?.s, requested, 'Content payload must return the requested active review.');
assert.equal(
  content.active?.body,
  full.find(review => review.s === requested)?.body,
  'Content payload must preserve the active review body.'
);
assert(Array.isArray(content.active?.gallery), 'Content payload must preserve the active review gallery.');

const fullBytes = Buffer.byteLength(JSON.stringify(full));
const compactBytes = Buffer.byteLength(JSON.stringify(compact));
const contentBytes = Buffer.byteLength(JSON.stringify(content));
const reductionPercent = Number(((1 - compactBytes / fullBytes) * 100).toFixed(1));
const contentReductionPercent = Number(((1 - contentBytes / fullBytes) * 100).toFixed(1));

assert(
  compactBytes < fullBytes * 0.75,
  `Compact catalogue must reduce serialized payload by at least 25%; reduction was ${reductionPercent}%.`
);
assert(
  contentBytes < fullBytes * 0.75,
  `Content payload must reduce serialized payload by at least 25%; reduction was ${contentReductionPercent}%.`
);

const homeSource = readFileSync(new URL('../assets/js/home-v3.js', import.meta.url), 'utf8');
const cafeSource = readFileSync(new URL('../assets/js/cine-cafe.js', import.meta.url), 'utf8');
const contentV3Source = readFileSync(new URL('../assets/js/content-v3.js', import.meta.url), 'utf8');
const dynamicDataSource = readFileSync(new URL('../src/admin-console.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

const usesCompactCatalog = source => (
  source.includes("fetch('/data/catalog.json')") ||
  source.includes("const sources = ['/data/catalog.json', '/data/index.json']")
);

assert(usesCompactCatalog(homeSource), 'Home must use the compact catalogue endpoint.');
assert(usesCompactCatalog(cafeSource), 'Cine Cafe must use the compact catalogue endpoint.');
assert(
  contentV3Source.includes("new URL('/data/content.json', location.origin)"),
  'Content V3 must request the optimized Content payload endpoint first.'
);
assert(
  contentV3Source.includes('loadReviewPayload(slug)'),
  'Content V3 must initialize through the optimized payload loader.'
);
assert(dynamicDataSource.includes("url.pathname === '/data/catalog.json'"), 'Worker must serve the compact endpoint.');
assert(dynamicDataSource.includes("url.pathname === '/data/content.json'"), 'Worker must serve the Content endpoint.');
assert(wrangler.includes('"/data/catalog.json"'), 'Cloudflare must run the Worker first for the compact endpoint.');
assert(wrangler.includes('"/data/content.json"'), 'Cloudflare must run the Worker first for the Content endpoint.');

console.log(
  `Compact catalogue: ${compact.length} reviews, ${fullBytes} -> ${compactBytes} bytes (${reductionPercent}% reduction).`
);
console.log(
  `Content payload: ${fullBytes} -> ${contentBytes} bytes (${contentReductionPercent}% reduction for one active review).`
);
