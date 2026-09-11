import assert from 'node:assert/strict';
import test from 'node:test';
import { installBindings } from './helpers/d1.mjs';
installBindings({});
const { initReviewDisplay } = await import('../src/lib/review-display.ts');

test('one title controller preserves timing, hidden pages and reduced motion, and releases replaced cards', () => {
  const frames = new Map();
  let nextFrame = 0;
  let mutations, resize;
  const observed = new Set();
  const motion = { matches: false, addEventListener(_, callback) { this.change = callback; } };
  const animations = [];
  const track = () => ({ dataset: {}, style: {}, scrollWidth: 180, textContent: '',
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    } });
  const title = (lounge = false) => {
    const values = new Set();
    const element = {
      dataset: {}, clientWidth: 100, textContent: 'A long movie title', isConnected: true, hidden: false,
      track: lounge ? track() : null,
      classList: { add: n => values.add(n), remove: n => values.delete(n), contains: n => values.has(n) },
      hasAttribute: name => lounge && name === 'data-title-marquee',
      closest() { return this.hidden ? {} : null; },
      querySelector(selector) { return selector.includes('data-review-title-track') && !this.track?.dataset.reviewTitleTrack ? null : this.track; },
      appendChild(value) { this.track = value; },
    };
    return element;
  };
  const recent = title(true), cafe = title();
  let titles = [recent, cafe];
  globalThis.document = {
    body: {}, addEventListener() {}, createElement: track,
    querySelectorAll: selector => selector.includes('title') ? titles : [],
  };
  globalThis.window = { matchMedia: () => motion, addEventListener() {} };
  globalThis.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.getComputedStyle = () => ({ paddingLeft: '5', paddingRight: '5' });
  globalThis.ResizeObserver = class {
    constructor(callback) { resize = callback; }
    observe(element) { observed.add(element); }
    unobserve(element) { observed.delete(element); }
  };
  globalThis.MutationObserver = class {
    constructor(callback) { mutations = callback; }
    observe(_, options) { assert(options.attributeFilter.includes('aria-hidden')); }
  };
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  initReviewDisplay();
  assert.equal(animations.length, 2);
  assert.equal(recent.dataset.globalTitleMarquee, undefined, 'Lounge keeps its existing CSS geometry');
  assert.equal(cafe.dataset.globalTitleMarquee, 'true');
  assert.equal(animations[0].options.duration, 14250);
  assert.equal(animations[0].keyframes[2].transform, 'translateX(-90px)');

  mutations([{ type: 'childList' }]); flush();
  assert.equal(animations.length, 2, 'unrelated DOM updates must not restart moving titles');
  recent.hidden = true;
  mutations([{ type: 'attributes' }]); flush();
  assert(animations[0].cancelled);
  assert(!animations[1].cancelled);
  recent.hidden = false;
  mutations([{ type: 'attributes' }]); flush();
  assert.equal(animations.length, 3);

  cafe.clientWidth = 240;
  resize(); flush();
  assert(animations[1].cancelled, 'a title that now fits stops moving');
  assert(!cafe.classList.contains('is-moving'));
  motion.matches = true;
  motion.change(); flush();
  assert(animations[2].cancelled);
  motion.matches = false;
  motion.change(); flush();
  assert.equal(animations.length, 4);

  recent.isConnected = false;
  const replacement = title();
  titles = [cafe, replacement];
  mutations([{ type: 'childList' }]); flush();
  assert(animations[3].cancelled);
  assert(!observed.has(recent));
  assert(observed.has(replacement));
  assert.equal(animations.length, 5);
});
