import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { backgroundImageUrls, prepareLounge, waitForImage } from '../src/lib/lounge-loading.ts';

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

function environment({ poster = new ImageDouble(), badArtwork = false, fonts = Promise.resolve() } = {}) {
  const original = { document: globalThis.document, Image: globalThis.Image, getComputedStyle: globalThis.getComputedStyle };
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
  const page = {
    setAttribute() {},
    querySelectorAll(selector) {
      return selector.includes('.lounge-backdrop') ? [{}, {}] : [poster];
    },
  };
  return { document, page, events, backgrounds, restore: () => Object.assign(globalThis, original) };
}

test('the whole Lounge waits for off-screen posters and fonts, then cached returns work', async () => {
  const fontGate = deferred();
  const posterGate = deferred();
  const poster = new ImageDouble();
  poster.decodeResult = posterGate.promise;
  const env = environment({ poster, fonts: fontGate.promise });
  try {
    prepareLounge(env.page);
    await tick();
    assert.equal(poster.loading, 'eager');
    assert.deepEqual(env.backgrounds, ['/selected.webp']);
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    posterGate.resolve();
    await tick();
    assert.equal(env.events.some((e) => e.name === 'lounge:assets-ready'), false);
    fontGate.resolve();
    await tick();
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 1);
    env.document.dispatchEvent(new Event('lounge:resume-loading'));
    await tick();
    assert.equal(env.events.filter((e) => e.name === 'lounge:assets-ready').length, 2);
  } finally { env.restore(); }
});

test('failed artwork reports recovery without automatically opening an incomplete Lounge', async () => {
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

test('the loading screen offers recovery on a slow connection and only fades on readiness', () => {
  const source = readFileSync(new URL('../src/components/lobby/LoungeLoading.astro', import.meta.url), 'utf8');
  const script = source.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  const root = { dataset: {} };
  const message = { textContent: '' };
  const progress = { value: 0 };
  const recovery = { hidden: true };
  const buttons = { '[data-loading-retry]': new EventTarget(), '[data-loading-open]': new EventTarget() };
  const screen = {
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
  assert.equal(recovery.hidden, false);
  assert.equal(root.dataset.loungeState, 'loading');
  buttons['[data-loading-retry]'].dispatchEvent(new Event('click'));
  assert.equal(reloaded, true);
  document.dispatchEvent(new Event('lounge:loading-error'));
  assert.equal(root.dataset.loungeState, 'loading');
  document.dispatchEvent(new Event('lounge:assets-ready'));
  assert.equal(root.dataset.loungeState, 'revealing');
  assert.equal(progress.value, 100);
  frames.shift()();
  assert.equal(root.dataset.loungeState, 'revealing');
  frames.shift()();
  assert.equal(root.dataset.loungeState, 'leaving');
  timers.find((timer) => timer.delay === 400).callback();
  assert.equal(root.dataset.loungeState, undefined);
});
