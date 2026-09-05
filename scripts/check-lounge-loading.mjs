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

test('prepareLounge schedules lower posters without duplicating Lobby readiness work', () => {
  const original = {
    document: globalThis.document,
    window: globalThis.window,
    IntersectionObserver: globalThis.IntersectionObserver,
  };

  const events = [];
  const document = new EventTarget();
  document.documentElement = { dataset: { loungeState: 'loading' } };
  for (const name of ['lounge:assets-ready', 'lounge:loading-error', 'lounge:loading-progress']) {
    document.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  }

  let source = '/poster.webp';
  const listeners = new Map();
  const poster = {
    dataset: {},
    fetchPriority: 'auto',
    loading: 'lazy',
    complete: false,
    style: {
      visibility: '',
      removeProperty(name) { if (name === 'visibility') this.visibility = ''; },
    },
    getAttribute(name) { return name === 'src' ? source : null; },
    removeAttribute(name) { if (name === 'src') source = null; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    set src(value) { source = value; },
    get src() { return source; },
  };

  const section = {
    querySelectorAll(selector) { return selector === 'img[data-lounge-deferred-src]' ? [poster] : []; },
    getBoundingClientRect() { return { top: 5000, bottom: 5200 }; },
  };

  const observed = [];
  globalThis.document = document;
  globalThis.window = { innerHeight: 800 };
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; }
    observe(target) { observed.push(target); }
    unobserve() {}
  };

  const page = {
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelectorAll(selector) {
      if (selector.includes('.recent-card__poster img')) return [poster];
      if (selector === '.lounge-panel--recent, .lounge-panel--previous') return [section];
      return [];
    },
  };

  try {
    prepareLounge(page);
    assert.equal(page.attributes.get('aria-busy'), 'true');
    assert.equal(source, null);
    assert.equal(poster.dataset.loungeDeferredSrc, '/poster.webp');
    assert.equal(poster.fetchPriority, 'low');
    assert.equal(poster.style.visibility, 'hidden');
    assert.deepEqual(observed, [section]);
    assert.equal(events.length, 0);
  } finally {
    globalThis.document = original.document;
    globalThis.window = original.window;
    globalThis.IntersectionObserver = original.IntersectionObserver;
  }
});

function cinemaEnvironment({ poster = new ImageDouble(), badArtwork = false } = {}) {
  const original = {
    document: globalThis.document,
    Image: globalThis.Image,
    getComputedStyle: globalThis.getComputedStyle,
  };

  const document = new EventTarget();
  document.documentElement = { dataset: { loungeState: 'loading' } };
  const events = [];
  for (const name of ['lounge:assets-ready', 'lounge:loading-error', 'lounge:loading-progress']) {
    document.addEventListener(name, (event) => events.push({ name, detail: event.detail }));
  }

  globalThis.document = document;
  globalThis.Image = class extends ImageDouble {
    set src(_url) { if (badArtwork) this.naturalWidth = 0; }
  };
  globalThis.getComputedStyle = () => ({ backgroundImage: 'none' });

  const page = {
    attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    querySelectorAll(selector) { return selector === 'img' ? [poster] : []; },
  };

  return {
    document,
    page,
    events,
    restore: () => {
      globalThis.document = original.document;
      globalThis.Image = original.Image;
      globalThis.getComputedStyle = original.getComputedStyle;
    },
  };
}

function loadingScreenHarness({
  room = 'The Lobby',
  theme = 'lobby',
  preview = false,
  criticalImages = [],
  pageParsed = false,
} = {}) {
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
    dataset: {
      room,
      theme,
      preview: String(preview),
      criticalImages: JSON.stringify(criticalImages),
    },
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
  document.activeElement = null;
  document.querySelector = (selector) => {
    if (selector === '[data-lounge-loader]') return screen;
    if (selector === '.lounge-page') return pageParsed ? {} : null;
    return null;
  };

  const window = new EventTarget();
  const timers = [];
  const frames = [];
  let reloaded = false;
  window.setTimeout = (callback, delay) => { timers.push({ callback, delay, cleared: false }); return timers.length; };
  window.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; };
  window.location = { reload: () => { reloaded = true; } };
  window.matchMedia = () => ({ matches: false });

  class FastImage extends EventTarget {
    complete = true;
    naturalWidth = 100;
    decoding = 'auto';
    fetchPriority = 'auto';
    set src(_url) {}
  }

  vm.runInNewContext(script, {
    document,
    window,
    Image: FastImage,
    Event,
    Number,
    Math,
    JSON,
    Boolean,
    Promise,
    Date: { now: () => 1000 },
    requestAnimationFrame: (callback) => frames.push(callback),
  });

  return { root, message, progress, recovery, buttons, document, window, timers, frames, reloaded: () => reloaded };
}

test('Lobby emergency guardrails remain ten-second recovery and fifteen-second hard fail-open', () => {
  const h = loadingScreenHarness();
  assert.equal(h.root.dataset.loungeState, 'loading');

  const slow = h.timers.find((timer) => timer.delay === 10000);
  const hardStop = h.timers.find((timer) => timer.delay === 15000);
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

test('fast Lobby probe opens as soon as critical frames and page markup are ready', async () => {
  const h = loadingScreenHarness({
    criticalImages: ['/banner.webp', '/now.webp'],
    pageParsed: true,
  });

  await tick();
  await tick();

  assert.equal(h.root.dataset.loungeState, 'revealing');
  assert.equal(h.progress.value, 100);
  assert.equal(h.recovery.hidden, true);

  h.frames.shift()();
  h.frames.shift()();
  assert.equal(h.root.dataset.loungeState, 'leaving');
  h.timers.find((timer) => timer.delay === 120).callback();
  assert.equal(h.root.dataset.loungeState, undefined);
});

test('loading design preview deliberately stays open until manually entered', () => {
  const h = loadingScreenHarness({ preview: true });
  h.timers.find((timer) => timer.delay === 15000).callback();
  assert.equal(h.root.dataset.loungeState, 'loading');
  h.document.dispatchEvent(new Event('lounge:assets-ready'));
  assert.equal(h.root.dataset.loungeState, 'loading');
  h.buttons['[data-loading-preview-open]'].dispatchEvent(new Event('click'));
  assert.equal(h.root.dataset.loungeState, 'revealing');
});

test('café with no content images opens immediately', async () => {
  const env = cinemaEnvironment();
  env.page.querySelectorAll = () => [];
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
  const env = cinemaEnvironment({ poster });

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
  const env = cinemaEnvironment({ poster });

  try {
    prepareCinemaPage(env.page);
    await tick();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:loading-error'), true);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), true);
  } finally { env.restore(); }
});
