import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const runtimeRoots = ['src', 'public'];
const textExtensions = new Set(['.astro', '.css', '.html', '.js', '.json', '.ts', '.tsx']);
const violations = [];

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

for (const file of runtimeRoots.flatMap(walk)) {
  if (!textExtensions.has(extname(file).toLowerCase())) continue;
  const content = readFileSync(file, 'utf8');

  if (/responsive/i.test(content)) {
    violations.push(`${file}: reserved project shorthand must not appear in runtime code or UI text`);
  }

  if (content.includes('.lounge-panel__art')) {
    violations.push(`${file}: obsolete hidden Lounge artwork hook must not return`);
  }
}

const index = readRequired('src/pages/index.astro');
const lobbyCss = readRequired('src/styles/lobby.css');
const lobbyReset = readRequired('src/styles/lobby-reset.css');
const loungeLoading = readRequired('src/lib/lounge-loading.ts');
const loadingComponent = readRequired('src/components/lobby/LoungeLoading.astro');

const removedLoungeFiles = [
  'src/styles/lobby-content.css',
  'src/styles/lobby-corners.css',
  'src/styles/lobby-polish.css',
  'src/styles/lobby-fit-and-focus.css',
  'src/components/lobby/LobbyReviewCard.astro',
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
  if (!lobbyCss.includes(file)) {
    violations.push(`src/styles/lobby.css: missing Premium Runtime artwork ${file}`);
  }
}

const legacyArtworkPattern = /Movie_Reviews_By_Poorna[^"')\s]*\.(?:png|avif)/i;
for (const [path, content] of [
  ['src/styles/lobby.css', lobbyCss],
  ['src/styles/lobby-reset.css', lobbyReset],
]) {
  if (legacyArtworkPattern.test(content)) {
    violations.push(`${path}: legacy PNG/AVIF Lounge runtime artwork reference detected`);
  }
}

if ((index.match(/import ['"]\.\.\/styles\/lobby\.css['"]/g) ?? []).length !== 1) {
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

for (const critical of runtimeArtwork.slice(1, 3)) {
  if (!loadingComponent.includes(critical)) {
    violations.push(`src/components/lobby/LoungeLoading.astro: missing fast Lobby critical asset ${critical}`);
  }
}

for (const timing of [
  'const fastLobbyFallbackMs = 2000;',
  "const recoveryDelayMs = theme === 'lobby' ? 10000 : 1200;",
  "const maximumHoldMs = theme === 'lobby' ? 15000 : 2200;",
]) {
  if (!loadingComponent.includes(timing)) {
    violations.push(`src/components/lobby/LoungeLoading.astro: loader guardrail changed unexpectedly: ${timing}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Runtime guardrail violation(s):\n${violations.join('\n')}`);
}

console.log('Runtime naming, Lounge cleanup, artwork and loading guardrails passed.');
