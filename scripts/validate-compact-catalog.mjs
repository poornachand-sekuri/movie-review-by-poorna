import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  COMPACT_REVIEW_FIELDS,
  compactReviews
} from '../src/review-catalog.js';

const full = JSON.parse(readFileSync(new URL('../public/data/index.json', import.meta.url), 'utf8'));
const compact = compactReviews(full);

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

const fullBytes = Buffer.byteLength(JSON.stringify(full));
const compactBytes = Buffer.byteLength(JSON.stringify(compact));
const reductionPercent = Number(((1 - compactBytes / fullBytes) * 100).toFixed(1));

assert(
  compactBytes < fullBytes * 0.75,
  `Compact catalogue must reduce serialized payload by at least 25%; reduction was ${reductionPercent}%.`
);

const homeSource = readFileSync(new URL('../assets/js/home-v3.js', import.meta.url), 'utf8');
const cafeSource = readFileSync(new URL('../assets/js/cine-cafe.js', import.meta.url), 'utf8');
const contentSource = readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
const workerEntry = readFileSync(new URL('../src/worker-entry.js', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert(homeSource.includes("fetch('/data/catalog.json')"), 'Home must use the compact catalogue endpoint.');
assert(cafeSource.includes("fetch('/data/catalog.json')"), 'Cine Cafe must use the compact catalogue endpoint.');
assert(
  contentSource.includes('fetch(`${CONFIG.dataBase}/index.json`)'),
  'Content pages must retain the full review endpoint.'
);
assert(workerEntry.includes("url.pathname === '/data/catalog.json'"), 'Worker must serve the compact endpoint.');
assert(wrangler.includes('"/data/catalog.json"'), 'Cloudflare must run the Worker first for the compact endpoint.');

console.log(
  `Compact catalogue: ${compact.length} reviews, ${fullBytes} -> ${compactBytes} bytes (${reductionPercent}% reduction).`
);
