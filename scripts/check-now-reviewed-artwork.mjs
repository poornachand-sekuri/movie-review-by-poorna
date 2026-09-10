import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loungeRuntimeAssets } from '../src/lib/lounge-assets.ts';

// Approved 1310 × 1275 exports, with the MY POV interior increased by 25%.
// Exact matches also preserve their verified
// exterior-only alpha channel, colors, and the geometry used by lounge.css.
const files = [
  ['03_Now_Reviewed_Panel.png', 'ed3f20c3f0275d77e30bd0f8a43ce3fa7f39cc076a043aefe628f06f467d1ccb'],
  ['03_Now_Reviewed_Panel_lossless.webp', '707cbb04b989b5009599948ec902e346df4de140553ed101ef683758ddb90029'],
  ['03_Now_Reviewed_Panel_runtime_q99.webp', '0f2fb92abad57d11c7064022186f22bed0943f20b6d353c7e2820bdf6beade59'],
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
