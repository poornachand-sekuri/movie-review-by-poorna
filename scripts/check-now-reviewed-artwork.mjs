import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loungeRuntimeAssets } from '../src/lib/lounge-assets.ts';

// Approved 1310 × 1200 exports. Exact matches also preserve their verified
// exterior-only alpha channel, colors, and the geometry used by lounge.css.
const files = [
  ['03_Now_Reviewed_Panel.png', '23e4478dda92a4f12b1b7ccb8be7a9ccfe4b7d69ceb441eb0a15dc2f2c3e7798'],
  ['03_Now_Reviewed_Panel_lossless.webp', '1a55973a98bfc108f002c16f306f9e004d9781cf12d0b986d4599f9cd8bacff9'],
  ['03_Now_Reviewed_Panel_runtime_q99.webp', '8eecb9e062b71406367b8050d2e003ca2e88386718510e58ae6529f27d92ba54'],
];
const runtimeUrl = new URL(loungeRuntimeAssets.nowReviewed);
const css = readFileSync(new URL('../src/styles/lounge.css', import.meta.url), 'utf8');
assert(css.includes(runtimeUrl.href), 'Panel CSS and critical-image preloading must use the same versioned URL.');

await Promise.all(files.map(async ([name, expected]) => {
  const url = new URL(name, runtimeUrl);
  url.search = runtimeUrl.search;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert(response.ok, `${name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actual, expected, `${name}: R2 upload differs from the approved transparent export`);
  console.log(`Verified R2: ${name} (${bytes.length} bytes, exact approved file)`);
}));
