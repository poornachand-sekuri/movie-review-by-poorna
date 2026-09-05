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
  decoding = 'auto';
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

function environment({ poster = new ImageDouble(), badArtwork = false } = {}) {
  const original = {
    document: globalThis.document,
    Image: globalThis.Image,
    getComputedStyle: globalThis.getComputedStyle,
    IntersectionObserver: globalThis.IntersectionObserver,
  };

  const document = new EventTarget();
  document.documentElement = { dataset: { loungeState: 'loading' } };
  document.fonts = { ready: new Promise(() => {}) };

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
      if (selector === 'img') return [];
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

test('Lounge readiness is critical-only; poster and fonts cannot trap the loader', async () => {
  const posterGate = deferred();
  const poster = new ImageDouble();
  poster.decodeResult = posterGate.promise;
  const env = environment({ poster });

  try {
    prepareLounge(env.page);
    await tick();
    await tick();

    assert.equal(poster.loading, 'eager');
    assert.equal(poster.fetchPriority, 'high');
    assert.deepEqual(env.backgrounds, ['/selected.webp']);
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 1);

    assert.deepEqual(env.removedAttributes, ['style']);
    assert.equal(env.legacy[0].removeCalled, true);
    assert.equal(env.deferredSections.every((section) => section.classList.contains('is-art-ready')), true);

    // The intentionally unresolved poster and fonts do not block readiness.
    assert.equal(poster.decodeCalls, 1);
  } finally {
    posterGate.resolve();
    env.restore();
  }
});

test('failed critical Lounge artwork reports an error and still fails open', async () => {
  const env = environment({ badArtwork: true });
  try {
    prepareLounge(env.page);
    await tick();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:loading-error'), true);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), true);
  } finally { env.restore(); }
});

function loadingScreenHarness({ room = 'The Lobby', theme = 'lobby', preview = false } = {}) {
  const source = readFileSync(new URL('../src/components/lobby/LoungeLoading.astro', import.meta.url), 'utf8');
  const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];

  const root = { dataset: {} };
  const message = { textContent: '' };
  const progress = { value: 0 };
  const recovery = { hidden: true };
  const buttons = {
    '[data-loading-retry]': new EventTarget(),
    '[data-loading-open]': new EventTarget(),
    '[data-loading-preview-open]': new EventTarget(),
  };
  const screen = {
    dataset: { room, theme, preview: String(preview) },
    contains: () => false,
    querySelector: (selector) => ({
      '[data-loading-message]': message,
      '[data-loading-progress]': progress,
      '[data-loading-recovery]': recovery,
      ...buttons,
    })[selector],
  };

  const document = new EventTarget();
  document.documentElement = root;
  document.querySelector = (selector) => selector === '[data-lounge-loader]' ? screen : null;

  const window = new EventTarget();
  const timers = [];
  const frames = [];
  let reloaded = false;
  window.setTimeout = (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length; };
  window.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  window.location = { reload: () => { reloaded = true; } };
  window.matchMedia = () => ({ matches: false });

  vm.runInNewContext(script, {
    document,
    window,
    Event,
    Number,
    Math,
    Date: { now: () => 1000 },
    requestAnimationFrame: (callback) => frames.push(callback),
  });

  return { root, message, progress, recovery, buttons, document, window, timers, frames, reloaded: () => reloaded };
}

test('normal Lobby loading screen has a hard three-second fail-open', () => {
  const h = loadingScreenHarness();
  assert.equal(h.root.dataset.loungeState, 'loading');

  const slow = h.timers.find((timer) => timer.delay === 1200);
  const hardStop = h.timers.find((timer) => timer.delay === 3000);
  assert(slow);
  assert(hardStop);

  slow.callback();
  assert.equal(h.recovery.hidden, false);

  hardStop.callback();
  const minimumDelay = h.timers.find((timer) => timer.delay === 350);
  assert(minimumDelay);
  minimumDelay.callback();
  assert.equal(h.root.dataset.loungeState, 'revealing');

  h.frames.shift()();
  h.frames.shift()();
  assert.equal(h.root.dataset.loungeState, 'leaving');
  h.timers.find((timer) => timer.delay === 240).callback();
  assert.equal(h.root.dataset.loungeState, undefined);
});

test('asset failure opens the page instead of leaving a permanent loading screen', () => {
  const h = loadingScreenHarness();
  h.document.dispatchEvent(new Event('lounge:loading-error'));
  const minimumDelay = h.timers.find((timer) => timer.delay === 350);
  assert(minimumDelay);
  minimumDelay.callback();
  assert.equal(h.root.dataset.loungeState, 'revealing');
});

test('loading design preview deliberately stays open until manually entered', () => {
  const h = loadingScreenHarness({ preview: true });
  h.timers.find((timer) => timer.delay === 3000).callback();
  assert.equal(h.root.dataset.loungeState, 'loading');
  h.document.dispatchEvent(new Event('lounge:assets-ready'));
  assert.equal(h.root.dataset.loungeState, 'loading');
  h.buttons['[data-loading-preview-open]'].dispatchEvent(new Event('click'));
  assert.equal(h.root.dataset.loungeState, 'revealing');
});

test('café with no content images opens immediately', async () => {
  const env = environment();
  env.page.querySelectorAll = () => [];
  globalThis.getComputedStyle = () => ({ backgroundImage: 'none' });
  try {
    prepareCinemaPage(env.page);
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), true);
  } finally { env.restore(); }
});

test('screening room waits only for the first poster and then opens', async () => {
  const posterGate = deferred();
  const poster = new ImageDouble();
  poster.decodeResult = posterGate.promise;
  const env = environment();
  env.page.querySelectorAll = (selector) => selector === 'img' ? [poster] : [];
  globalThis.getComputedStyle = () => ({ backgroundImage: 'none' });

  try {
    prepareCinemaPage(env.page);
    await tick();
    assert.equal(poster.loading, 'eager');
    assert.equal(poster.fetchPriority, 'high');
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    posterGate.resolve();
    await tick();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), true);
  } finally { env.restore(); }
});

test('broken screening poster reports the problem but still opens', async () => {
  const poster = new ImageDouble();
  poster.naturalWidth = 0;
  const env = environment();
  env.page.querySelectorAll = (selector) => selector === 'img' ? [poster] : [];
  globalThis.getComputedStyle = () => ({ backgroundImage: 'none' });

  try {
    prepareCinemaPage(env.page);
    await tick();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:loading-error'), true);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), true);
  } finally { env.restore(); }
});
