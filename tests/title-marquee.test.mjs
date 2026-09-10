import assert from 'node:assert/strict';
import test from 'node:test';
import { createTitleMarqueeController } from '../src/lib/title-marquee.ts';
import { installBindings } from './helpers/d1.mjs';

class Element {
  parentElement = null;
  children = [];
  dataset = {};
  style = {};
  clientWidth = 100;
  scrollWidth = 200;
  hiddenAncestor = false;
  calls = [];
  values = new Set();
  classList = {
    add: (value) => this.values.add(value),
    remove: (value) => this.values.delete(value),
  };
  get textContent() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this.text ?? ''; }
  set textContent(value) { this.text = value; this.children = []; }
  appendChild(child) { this.children.push(child); child.parentElement = this; }
  matches(selector) {
    return selector.split(',').some((part) => {
      const value = part.trim();
      return value === '[data-title-marquee]' && 'titleMarquee' in this.dataset
        || value === '[data-global-title-marquee]' && 'globalTitleMarquee' in this.dataset
        || value.startsWith('.') && this.values.has(value.slice(1));
    });
  }
  closest(selector) {
    if (selector === '[aria-hidden="true"]') return this.hiddenAncestor ? this : null;
    return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null;
  }
  querySelector(selector) {
    if (selector === ':scope > [data-review-title-track]') return this.children.find((child) => 'reviewTitleTrack' in child.dataset) ?? null;
    if (selector === ':scope > span') return this.children[0] ?? null;
    for (const child of this.children) {
      if (child.matches(selector)) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  animate(frames, options) {
    const animation = { cancelled: false, cancel() { this.cancelled = true; } };
    this.calls.push({ frames, options, animation });
    return animation;
  }
}

function title() {
  const element = new Element();
  const track = new Element();
  element.dataset.titleMarquee = '';
  element.children = [track];
  track.parentElement = element;
  return { element, track };
}

const computedStyle = () => ({ paddingLeft: '5px', paddingRight: '5px' });
globalThis.getComputedStyle = computedStyle;

test('titles keep the established speed, endpoint pauses and padded travel distance', () => {
  const { element, track } = title();
  createTitleMarqueeController().fit(element, false);
  assert.equal(track.calls.length, 1);
  const { frames, options } = track.calls[0];
  assert.equal(options.duration, 16750);
  assert.equal(options.iterations, Infinity);
  assert.equal(frames[2].transform, 'translateX(-110px)');
  assert.equal(frames[1].offset * options.duration, 1500);
  assert(Math.abs((frames[3].offset - frames[2].offset) * options.duration - 1500) < 0.001);
});

test('unchanged refreshes retain an animation; width changes replace it once', () => {
  const controller = createTitleMarqueeController();
  const { element, track } = title();
  controller.fit(element, false);
  controller.fit(element, false);
  assert.equal(track.calls.length, 1);
  element.clientWidth = 150;
  controller.fit(element, false);
  assert(track.calls[0].animation.cancelled);
  assert.equal(track.calls[1].frames[2].transform, 'translateX(-60px)');
});

test('hidden carousel pages, reduced motion, fitting and zero-width titles stop moving', () => {
  for (const condition of ['hidden', 'motion', 'fits', 'zero']) {
    const controller = createTitleMarqueeController();
    const { element, track } = title();
    controller.fit(element, false);
    if (condition === 'hidden') element.hiddenAncestor = true;
    if (condition === 'fits') track.scrollWidth = 90;
    if (condition === 'zero') element.clientWidth = 0;
    controller.fit(element, condition === 'motion');
    assert(track.calls[0].animation.cancelled, condition);
    assert(!element.values.has('is-moving'), condition);
    assert.equal(track.style.transform, 'translateX(0)');
  }
});

test('replacing a title track or removing a card cancels its previous animation', () => {
  const controller = createTitleMarqueeController();
  const { element, track } = title();
  controller.fit(element, false);
  const replacement = new Element();
  element.children = [replacement];
  controller.fit(element, false);
  assert(track.calls[0].animation.cancelled);
  controller.remove(element);
  assert(replacement.calls[0].animation.cancelled);
  assert(!element.values.has('is-moving'));
});

test('shared display tracks dynamic cards, carousel visibility and resize without reacting to comments', async () => {
  installBindings({});
  globalThis.Element = Element;
  globalThis.HTMLImageElement = class extends Element {};
  const frames = [];
  const observed = new Set();
  let onMutation, onResize, onMotion;
  let observerCount = 0;
  const motion = { matches: false, addEventListener(_name, callback) { onMotion = callback; } };
  globalThis.window = { matchMedia: () => motion, addEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.ResizeObserver = class {
    constructor(callback) { onResize = callback; }
    observe(node) { observed.add(node); }
    unobserve(node) { observed.delete(node); }
  };
  globalThis.MutationObserver = class {
    constructor(callback) { onMutation = callback; observerCount++; }
    observe() {}
  };
  const first = title();
  let current = [first.element];
  globalThis.document = {
    body: new Element(), addEventListener() {},
    createElement: () => new Element(),
    querySelectorAll(selector) { return current.filter((node) => node.matches(selector)); },
  };
  const flush = () => { while (frames.length) frames.shift()(); };
  const change = (target, addedNodes = [], removedNodes = []) => ({ type: 'childList', target, addedNodes, removedNodes });
  const { initReviewDisplay } = await import('../src/lib/review-display.ts');
  initReviewDisplay();
  initReviewDisplay();
  flush();
  assert.equal(observerCount, 1);
  assert.equal(first.track.calls.length, 1);

  onMutation([change(new Element(), [new Element()])]);
  assert.equal(frames.length, 0, 'unrelated comment/like DOM updates do not schedule display work');

  const page = new Element(); page.children = [first.element];
  first.element.hiddenAncestor = true;
  onMutation([{ type: 'attributes', attributeName: 'aria-hidden', target: page }]);
  flush();
  assert(first.track.calls[0].animation.cancelled);
  first.element.hiddenAncestor = false;
  onMutation([{ type: 'attributes', attributeName: 'aria-hidden', target: page }]);
  flush();
  assert.equal(first.track.calls.length, 2);

  const next = { element: new Element() };
  next.element.textContent = 'New movie <title>';
  next.element.values.add('cini-cafe-review-title');
  current = [next.element];
  onMutation([change(new Element(), current, [first.element])]);
  flush();
  next.track = next.element.children[0];
  assert.equal(next.track.textContent, 'New movie <title>');
  assert.equal(next.track.dataset.reviewTitleTrack, 'true');
  assert(first.track.calls[1].animation.cancelled);
  assert(!observed.has(first.element));
  assert(observed.has(next.element));
  assert.equal(next.track.calls.length, 1);

  next.element.clientWidth = 140;
  onResize(); flush();
  assert.equal(next.track.calls.length, 2);
  motion.matches = true;
  onMotion(); flush();
  assert(next.track.calls[1].animation.cancelled);
});
