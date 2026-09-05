import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { backgroundImageUrls, prepareLounge, prepareCinemaPage, waitForImage } from '../src/lib/lounge-loading.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

class ImageDouble extends EventTarget {
  complete = true;
  naturalWidth = 100;
  loading = 'lazy';
  fetchPriority = 'auto';
  decodeResult = Promise.resolve();
  decodeCalls = 0;
  decode() { this.decodeCalls += 1; return this.decodeResult; }
}

const classListDouble = () => {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    contains(value) { return values.has(value); },
  };
};

test('selected artwork URLs exclude gradients and support multiple backgrounds', () => {
  assert.deepEqual(backgroundImageUrls('linear-gradient(#000, #111), url("/backdrop.png"), url(/banner.webp)'), ['/backdrop.png', '/banner.webp']);
  assert.deepEqual(backgroundImageUrls('none'), []);
});

test('an image is not ready until its bitmap finishes decoding', async () => {
  const image = new ImageDouble();
  const decoded = deferred();
  image.complete = false;
  image.naturalWidth = 0;
  image.decodeResult = decoded.promise;
  let ready = false;
  const pending = waitForImage(image).then(() => { ready = true; });
  image.complete = true;
  image.naturalWidth = 100;
  image.dispatchEvent(new Event('load'));
  await tick();
  assert.equal(ready, false);
  decoded.resolve();
  await pending;
  assert.equal(ready, true);
});

test('cached, broken and undecodable images are distinguished', async () => {
  const cached = new ImageDouble();
  await waitForImage(cached);
  assert.equal(cached.decodeCalls, 1);
  const broken = new ImageDouble();
  broken.naturalWidth = 0;
  await assert.rejects(waitForImage(broken), /unavailable/);
  const corrupt = new ImageDouble();
  corrupt.decodeResult = Promise.reject(new Error('decode failed'));
  await assert.rejects(waitForImage(corrupt), /decode failed/);
});

function environment({ poster = new ImageDouble(), badArtwork = false, fonts = Promise.resolve() } = {}) {
  const original = {
    document: globalThis.document,
    Image: globalThis.Image,
    getComputedStyle: globalThis.getComputedStyle,
    IntersectionObserver: globalThis.IntersectionObserver,
  };

  const document = new EventTarget();
  document.documentElement = { dataset: { loungeState: 'loading' } };
  document.fonts = { ready: fonts };

  const backgrounds = [];
  const events = [];
  for (const name of ['lounge:assets-ready', 'lounge:loading-error', 'lounge:loading-progress']) {
    document.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  }

  globalThis.document = document;
  globalThis.Image = class extends ImageDouble {
    set src(url) { backgrounds.push(url); if (badArtwork) this.naturalWidth = 0; }
  };
  globalThis.getComputedStyle = () => ({ backgroundImage: 'url("/selected.webp")' });
  globalThis.IntersectionObserver = undefined;

  const removedAttributes = [];
  const backdrop = { removeAttribute(name) { removedAttributes.push(name); } };
  const legacy = [{
    removeAttribute() {},
    removeCalled: false,
    remove() { this.removeCalled = true; },
  }];
  const deferredSections = Array.from({ length: 4 }, () => ({ classList: classListDouble() }));
  const criticalArtwork = [{}, {}];

  const page = {
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelector(selector) {
      if (selector === '.lounge-backdrop') return backdrop;
      if (selector === '.now-poster img') return poster;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.lounge-panel__art') return legacy;
      if (selector.includes('.lounge-panel--recent')) return deferredSections;
      if (selector.includes('.lounge-stage > .lounge-panel--banner')) return criticalArtwork;
      return [];
    },
  };

  return {
    document,
    page,
    events,
    backgrounds,
    removedAttributes,
    legacy,
    deferredSections,
    restore: () => {
      globalThis.document = original.document;
      globalThis.Image = original.Image;
      globalThis.getComputedStyle = original.getComputedStyle;
      globalThis.IntersectionObserver = original.IntersectionObserver;
    },
  };
}

test('the Lounge opens after critical first-screen artwork, featured poster and fonts only', async () => {
  const fontGate = deferred();
  const posterGate = deferred();
  const poster = new ImageDouble();
  poster.decodeResult = posterGate.promise;
  const env = environment({ poster, fonts: fontGate.promise });
  try {
    prepareLounge(env.page);
    await tick();

    assert.equal(poster.loading, 'eager');
    assert.equal(poster.fetchPriority, 'high');
    assert.deepEqual(env.backgrounds, ['/selected.webp']);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);

    // Obsolete hidden artwork is discarded and lower frames are armed without
    // becoming part of the initial readiness gate.
    assert.deepEqual(env.removedAttributes, ['style']);
    assert.equal(env.legacy[0].removeCalled, true);
    assert.equal(env.deferredSections.every((section) => section.classList.contains('is-art-ready')), true);

    posterGate.resolve();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);

    fontGate.resolve();
    await tick();
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 1);

    // Cached/retry returns still work without rebuilding a whole-page queue.
    env.document.dispatchEvent(new Event('lounge:resume-loading'));
    await tick();
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 2);
  } finally { env.restore(); }
});

test('failed critical artwork reports recovery without automatically opening an incomplete Lounge', async () => {
  const env = environment({ badArtwork: true });
  try {
    prepareLounge(env.page);
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:loading-error'), true);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    const progress = env.events.filter((e) => e.name === 'lounge:loading-progress').at(-1).detail;
    assert(progress.loaded < progress.total);
  } finally { env.restore(); }
});

for (const [room, preview] of [['The Lobby', false], ['The Screening Room', false], ['The Movie Café', false], ['The Lobby', true]]) test(`${room}: ${preview ? 'design preview stays open' : 'recovery and automatic reveal work'}`, () => {
  const source = readFileSync(new URL('../src/components/lobby/LoungeLoading.astro', import.meta.url), 'utf8');
  const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  const root = { dataset: {} };
  const message = { textContent: '' };
  const progress = { value: 0 };
  const recovery = { hidden: true };
  const buttons = { '[data-loading-retry]': new EventTarget(), '[data-loading-open]': new EventTarget(), '[data-loading-preview-open]': new EventTarget() };
  const screen = {
    dataset: { room, preview: String(preview) },
    contains: () => false,
    querySelector: (selector) => ({ '[data-loading-message]': message, '[data-loading-progress]': progress, '[data-loading-recovery]': recovery, ...buttons })[selector],
  };
  const document = new EventTarget();
  document.documentElement = root;
  document.querySelector = (selector) => selector === '[data-lounge-loader]' ? screen : null;
  const window = new EventTarget();
  const timers = [];
  const frames = [];
  let reloaded = false;
  window.setTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
  window.clearTimeout = () => {};
  window.location = { reload: () => { reloaded = true; } };
  window.matchMedia = () => ({ matches: false });
  vm.runInNewContext(script, { document, window, Event, requestAnimationFrame: (callback) => frames.push(callback) });
  assert.equal(root.dataset.loungeState, 'loading');
  timers.find((timer) => timer.delay === 20000).callback();
  assert.equal(recovery.hidden, preview);
  assert.equal(root.dataset.loungeState, 'loading');
  buttons['[data-loading-retry]'].dispatchEvent(new Event('click'));
  assert.equal(reloaded, true);
  document.dispatchEvent(new Event('lounge:loading-error'));
  assert.equal(root.dataset.loungeState, 'loading');
  document.dispatchEvent(new Event('lounge:assets-ready'));
  if (preview) {
    assert.equal(root.dataset.loungeState, 'loading');
    assert.equal(message.textContent, '');
    assert.equal(frames.length, 0);
    buttons['[data-loading-preview-open]'].dispatchEvent(new Event('click'));
  }
  assert.equal(root.dataset.loungeState, 'revealing');
  assert.equal(progress.value, 100);
  frames.shift()();
  assert.equal(root.dataset.loungeState, 'revealing');
  frames.shift()();
  assert.equal(root.dataset.loungeState, 'leaving');
  timers.find((timer) => timer.delay === 400).callback();
  assert.equal(root.dataset.loungeState, undefined);
});

for (const withPoster of [true, false]) test(`review/café gate waits for fonts${withPoster ? ' and review images' : ' without any images'}`, async () => {
  const fontGate = deferred();
  const posterGate = deferred();
  const poster = new ImageDouble();
  poster.decodeResult = posterGate.promise;
  const env = environment({ fonts: fontGate.promise });
  env.page.querySelectorAll = (selector) => selector === 'img' && withPoster ? [poster] : [];
  try {
    prepareCinemaPage(env.page);
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    fontGate.resolve();
    await tick();
    if (withPoster) {
      assert.equal(poster.loading, 'eager');
      assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    }
    posterGate.resolve();
    await tick();
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 1);
  } finally { env.restore(); }
});

test('a failed review poster offers recovery instead of leaving an unexplained spinner', async () => {
  const poster = new ImageDouble();
  poster.naturalWidth = 0;
  const env = environment();
  env.page.querySelectorAll = (selector) => selector === 'img' ? [poster] : [];
  try {
    prepareCinemaPage(env.page);
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:loading-error'), true);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
  } finally { env.restore(); }
});
