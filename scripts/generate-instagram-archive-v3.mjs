import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = path.resolve('scripts/generate-instagram-archive-v2.mjs');
const tempPath = path.resolve('scripts/.generate-instagram-archive-v3-runtime.mjs');
let source = await fs.readFile(sourcePath, 'utf8');

const original = "  const verdict = review.verdict || review.excerpt || 'POV coming soon.';";
const replacement = [
  "  const sourceVerdict = review.verdict || review.excerpt || 'POV coming soon.';",
  "  // A few legacy reviews attach the Telugu emphatic vowel sign directly to an English word",
  "  // (for example, graphics + ే). Browsers render that orphan combining sign as tofu/dotted-circle.",
  "  // Keep the stored/caption text untouched; normalize only the visual Instagram rendering to ē.",
  "  const verdict = sourceVerdict.replace(/(?<=[A-Za-z0-9])ే/g, 'ē');",
].join('\n');

if (!source.includes(original)) throw new Error('Could not locate the V2 verdict rendering line.');
source = source.replace(original, replacement);
await fs.writeFile(tempPath, source, 'utf8');

try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
} finally {
  await fs.rm(tempPath, { force: true });
}
