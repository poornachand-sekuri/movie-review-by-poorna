import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const namingRoots = ['src', 'public', 'docs', 'scripts', '.github', 'README.md'];
const textExtensions = new Set(['.astro', '.css', '.html', '.js', '.json', '.md', '.ts', '.tsx', '.yml', '.yaml']);
const violations = [];
const retiredHomeName = String.fromCharCode(108, 111, 98, 98, 121);
const retiredHomePattern = new RegExp(`\\b${retiredHomeName}\\b`, 'i');
const retiredReviewName = String.fromCharCode(115, 99, 114, 101, 101, 110, 105, 110, 103);
const retiredReviewPattern = new RegExp(`\\b${retiredReviewName}\\b`, 'i');

const walk = (path) => {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
};

const readRequired = (path) => {
  if (!existsSync(path)) {
    violations.push(`${path}: required runtime file is missing`);
    return '';
  }
  return readFileSync(path, 'utf8');
};

for (const file of namingRoots.flatMap(walk)) {
  if (file.toLowerCase().includes(retiredHomeName)) {
    violations.push(`${file}: retired Home room name must not appear in project paths`);
  }
  if (file.toLowerCase().includes(retiredReviewName)) {
    violations.push(`${file}: retired Review room name must not appear in project paths`);
  }

  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(file, 'utf8');

  if (/responsive/i.test(content)) {
    violations.push(`${file}: reserved project shorthand must not appear in runtime code or UI text`);
  }

  if (retiredHomePattern.test(content)) {
    violations.push(`${file}: retired Home room name must not appear in project code, docs or UI text`);
  }
  if (retiredReviewPattern.test(content)) {
    violations.push(`${file}: retired Review room name must not appear in project code, docs or UI text`);
  }

  if (content.includes('.lounge-panel__art')) {
    violations.push(`${file}: obsolete hidden Lounge artwork hook must not return`);
  }
}

const index = readRequired('src/pages/index.astro');
const reviewPage = readRequired('src/pages/review/[slug].astro');
const siteFrame = readRequired('src/layouts/SiteFrame.astro');
const loungeAssets = readRequired('src/lib/lounge-assets.ts');
const loungeCss = readRequired('src/styles/lounge.css');
const loungeReset = readRequired('src/styles/lounge-reset.css');
const loungeLoading = readRequired('src/lib/lounge-loading.ts');
const loadingComponent = readRequired('src/components/lounge/LoungeLoading.astro');

const removedLoungeFiles = [
  'src/styles/lounge-content.css',
  'src/styles/lounge-corners.css',
  'src/styles/lounge-polish.css',
  'src/styles/lounge-fit-and-focus.css',
  'src/components/lounge/LoungeReviewCard.astro',
];

for (const path of removedLoungeFiles) {
  if (existsSync(path)) violations.push(`${path}: obsolete file was reintroduced`);
  if (index.includes(path.split('/').at(-1))) {
    violations.push(`src/pages/index.astro: imports obsolete ${path.split('/').at(-1)}`);
  }
}

const runtimeArtwork = [
  '01_Movie_Reviews_By_Poorna_Premier_Lounge_Background_runtime_q99.webp',
  '02_Movie_Reviews_By_Poorna_Banner_runtime_q99.webp',
  '03_Now_Reviewed_Panel_runtime_q99.webp',
  '04_Recent_Reviews_Panel_runtime_q99.webp',
  '05_Previously_Reviewed_Panel_runtime_q99.webp',
  '06_Share_Your_Opinion_Panel_runtime_q99.webp',
  '07_Lounge_Cini_Cafe_Banner_runtime_q99.webp',
  '08_Now_Reviewed_With_Exit_runtime_q99.webp',
  '09_Share_Your_Opinion_With_Exit_runtime_q99.webp',
];

for (const file of runtimeArtwork) {
  if (!loungeCss.includes(file)) {
    violations.push(`src/styles/lounge.css: missing Premium Runtime artwork ${file}`);
  }
}

const legacyArtworkPattern = /Movie_Reviews_By_Poorna[^"')\s]*\.(?:png|avif)/i;
for (const [path, content] of [
  ['src/styles/lounge.css', loungeCss],
  ['src/styles/lounge-reset.css', loungeReset],
]) {
  if (legacyArtworkPattern.test(content)) {
    violations.push(`${path}: legacy PNG/AVIF Lounge runtime artwork reference detected`);
  }
}

if ((index.match(/import ['"]\.\.\/styles\/lounge\.css['"]/g) ?? []).length !== 1) {
  violations.push('src/pages/index.astro: Home must import the consolidated Lounge stylesheet exactly once');
}

if (!index.includes('loading="eager"') || !index.includes('fetchpriority="high"')) {
  violations.push('src/pages/index.astro: featured poster must retain eager/high-priority delivery');
}

if ((index.match(/fetchpriority="low"/g) ?? []).length < 2) {
  violations.push('src/pages/index.astro: lower carousel posters must retain low fetch priority');
}

for (const obsoleteToken of ['removeLegacyArtworkRequests', 'is-art-ready']) {
  if (loungeLoading.includes(obsoleteToken)) {
    violations.push(`src/lib/lounge-loading.ts: obsolete Lounge loading flow token remains: ${obsoleteToken}`);
  }
}

for (const critical of runtimeArtwork.slice(0, 3)) {
  if (!loungeAssets.includes(critical)) {
    violations.push(`src/lib/lounge-assets.ts: missing cold-cache critical asset ${critical}`);
  }
}

if (!loadingComponent.includes("import { loungeCriticalImages } from '../../lib/lounge-assets';")) {
  violations.push('src/components/lounge/LoungeLoading.astro: must consume the shared critical Lounge asset list');
}

if (!loadingComponent.includes("auditorium: { name: 'The Auditorium'") || !loadingComponent.includes("image: '/images/loading/auditorium.png'")) {
  violations.push('src/components/lounge/LoungeLoading.astro: Auditorium identity and loading artwork must remain canonical');
}

if (!reviewPage.includes('<LoungeLoading theme="auditorium" />') || !reviewPage.includes('<p class="eyebrow">The Auditorium</p>')) {
  violations.push('src/pages/review/[slug].astro: individual reviews must render as The Auditorium');
}

if (!loadingComponent.includes("typeof image.decode === 'function'") || !loadingComponent.includes('await image.decode()')) {
  violations.push('src/components/lounge/LoungeLoading.astro: cold-cache critical images must wait for decode before reveal');
}

if (loadingComponent.includes('fastLoungeFallbackMs')) {
  violations.push('src/components/lounge/LoungeLoading.astro: short time-based Lounge reveal race must not bypass the backdrop');
}

if (!siteFrame.includes("import { loungeCriticalImages } from '../lib/lounge-assets';") ||
    !siteFrame.includes("Astro.url.pathname === '/'")) {
  violations.push('src/layouts/SiteFrame.astro: Home must preload the shared critical Lounge assets from <head>');
}

if (!siteFrame.includes("fetchPriority: 'high' as const")) {
  violations.push('src/layouts/SiteFrame.astro: critical Lounge preloads must retain high fetch priority');
}

for (const timing of [
  "const recoveryDelayMs = theme === 'lounge' ? 10000 : 1200;",
  "const maximumHoldMs = theme === 'lounge' ? 15000 : 2200;",
]) {
  if (!loadingComponent.includes(timing)) {
    violations.push(`src/components/lounge/LoungeLoading.astro: loader guardrail changed unexpectedly: ${timing}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Runtime guardrail violation(s):\n${violations.join('\n')}`);
}

console.log('Runtime room naming, Lounge cleanup, artwork and loading guardrails passed.');
