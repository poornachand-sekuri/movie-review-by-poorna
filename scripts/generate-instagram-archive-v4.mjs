import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sourcePath = path.resolve('scripts/generate-instagram-archive-v2.mjs');
const tempPath = path.resolve('scripts/.generate-instagram-archive-v4-runtime.mjs');
let source = await fs.readFile(sourcePath, 'utf8');

function replaceOrFail(from, to, label) {
  if (!source.includes(from)) throw new Error(`Could not locate ${label}.`);
  source = source.replace(from, to);
}

replaceOrFail(
`function titleSize(title) {
  const n = [...String(title ?? '')].length;
  if (n <= 16) return 62;
  if (n <= 24) return 54;
  if (n <= 34) return 48;
  return 42;
}`,
`function titleSize(title) {
  const n = [...String(title ?? '')].length;
  if (n <= 16) return 62;
  if (n <= 24) return 54;
  if (n <= 32) return 46;
  if (n <= 40) return 38;
  if (n <= 50) return 31;
  if (n <= 60) return 27;
  return 24;
}`,
  'title sizing function',
);

replaceOrFail(
`  const reviewed = formatDate(review.reviewedDate);\n  const released = formatDate(review.releaseDate);`,
`  const released = formatDate(review.releaseDate);`,
  'reviewed-date variable',
);

replaceOrFail(
`font-size:\${ts}px;line-height:1.02;font-weight:900;color:#f1c75f;text-transform:uppercase;text-shadow:0 5px 18px rgba(0,0,0,.95)}`,
`font-size:\${ts}px;line-height:1.02;font-weight:900;color:#f1c75f;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:clip;text-shadow:0 5px 18px rgba(0,0,0,.95)}`,
  'cover title CSS',
);

replaceOrFail(
`<div class="kicker">POORNA'S VERDICT&nbsp; • &nbsp;REVIEWED \${esc(reviewed)}</div><div class="title">\${esc(review.title)}</div>`,
`<div class="kicker">POORNA'S VERDICT</div><div class="title">\${esc(review.title)}</div>`,
  'cover kicker',
);

replaceOrFail(
`  <div class="meta-label">Poorna's Rating</div><div class="stars">\${stars(review.rating)}</div><div class="separator"></div>\n  <div class="meta-label">Reviewed On</div><div class="meta-value">\${esc(reviewed)}</div><div class="separator"></div>\n  <div class="meta-label">Release Date</div><div class="meta-value">\${esc(released)}</div></section>`,
`  <div class="meta-label">Poorna's Rating</div><div class="stars">\${stars(review.rating)}</div><div class="separator"></div>\n  <div class="meta-label">Release Date</div><div class="meta-value">\${esc(released)}</div></section>`,
  'reviewed-on metadata block',
);

replaceOrFail(
`height:505px;padding:28px 27px 22px`,
`height:405px;padding:34px 27px 26px`,
  'metadata panel height',
);

const originalVerdict = "  const verdict = review.verdict || review.excerpt || 'POV coming soon.';";
const replacementVerdict = [
  "  const sourceVerdict = review.verdict || review.excerpt || 'POV coming soon.';",
  "  const verdict = sourceVerdict.replace(/(?<=[A-Za-z0-9])ే/g, 'ē');",
].join('\n');
replaceOrFail(originalVerdict, replacementVerdict, 'visual verdict normalization');

await fs.writeFile(tempPath, source, 'utf8');
try {
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
} finally {
  await fs.rm(tempPath, { force: true });
}
