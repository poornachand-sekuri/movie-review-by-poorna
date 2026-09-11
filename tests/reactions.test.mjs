import assert from 'node:assert/strict';
import test from 'node:test';
import { installBindings } from './helpers/d1.mjs';
import { createClock } from './helpers/clock.mjs';
installBindings({});
const { initAuditoriumReactions } = await import('../src/lib/auditorium-reactions.ts');

const tick = () => new Promise((resolve) => setImmediate(resolve));
class Node extends EventTarget {
  dataset = {};
  textContent = '';
  attributes = new Map();
  values = new Set();
  classList = {
    add: (...values) => values.forEach((value) => this.values.add(value)),
    remove: (...values) => values.forEach((value) => this.values.delete(value)),
    contains: (value) => this.values.has(value),
    toggle: (value, enabled) => enabled ? this.values.add(value) : this.values.delete(value),
  };
  setAttribute(name, value) { this.attributes.set(name, value); }
}
function setup() {
  const root = new Node();
  root.dataset.reviewSlug = 'test';
  const nodes = new Map();
  for (const kind of ['like', 'dislike']) {
    const count = new Node(); count.textContent = '3';
    const button = new Node(); button.dataset.reactionAction = kind;
    nodes.set(`[data-reaction-count="${kind}"]`, count);
    nodes.set(`[data-reaction-action="${kind}"]`, button);
  }
  const buttons = [...nodes.entries()].filter(([selector]) => selector.includes('action')).map(([, node]) => node);
  root.querySelector = (selector) => nodes.get(selector);
  root.querySelectorAll = () => buttons;
  globalThis.document = Object.assign(new EventTarget(), { querySelector: () => root, visibilityState: 'visible' });
  const clock = createClock();
  globalThis.window = Object.assign(new EventTarget(), clock);
  const calls = [];
  globalThis.fetch = (url, options) => new Promise((resolve) => calls.push({ url, ...options, resolve }));
  initAuditoriumReactions();
  return { root, nodes, calls, clock, restorePage() {
    const event = new Event('pageshow'); event.persisted = true; window.dispatchEvent(event);
  } };
}
const reply = (call, likes, viewerReaction = null) => call.resolve(Response.json({ likes, dislikes: 0, viewerReaction }));

test('server-rendered reactions need no duplicate request; restored pages refresh', async () => {
  const h = setup();
  assert.equal(h.calls.length, 0);
  h.restorePage();
  h.clock.advance(50);
  assert.equal(h.calls[0].method, 'GET');
  reply(h.calls[0], 4);
  await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent, '4');
});

test('an older refresh cannot overwrite a completed vote', async () => {
  const h = setup();
  h.restorePage();
  h.clock.advance(50);
  const button = h.nodes.get('[data-reaction-action="like"]');
  button.dispatchEvent(new Event('click'));
  assert.equal(h.calls[1].method, 'POST');
  assert.equal(button.disabled, true);
  reply(h.calls[1], 5, 'like');
  await tick();
  reply(h.calls[0], 3);
  await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent, '5');
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  assert.equal(button.disabled, false);
});

test('cross-tab updates refresh counts and rapid repeated clicks send one explicit write', async () => {
  const h=setup();
  const event=new Event('storage');event.key='mrp:reaction-change';event.newValue=JSON.stringify({slug:'test'});
  window.dispatchEvent(event);
  h.clock.advance(50);
  reply(h.calls[0],1,'like');await tick();
  const button=h.nodes.get('[data-reaction-action="like"]');
  button.dispatchEvent(new Event('click'));button.dispatchEvent(new Event('click'));
  assert.equal(h.calls.length,2);
  assert.deepEqual(JSON.parse(h.calls[1].body),{reaction:null,mode:'set'});
  reply(h.calls[1],0);await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent,'0');
  assert.equal(button.attributes.get('aria-pressed'),'false');
});

test('idle pages make no requests and return events coalesce without overlapping refreshes', async () => {
  const h=setup();
  h.clock.advance(3600000);
  assert.equal(h.calls.length, 0);
  window.dispatchEvent(new Event('focus'));
  document.dispatchEvent(new Event('visibilitychange'));
  h.restorePage();
  h.clock.advance(50);
  assert.equal(h.calls.length, 1);
  h.restorePage(); h.clock.advance(50);
  h.restorePage(); h.clock.advance(50);
  assert.equal(h.calls.length, 1, 'new triggers queue one follow-up instead of overlapping');
  reply(h.calls[0],2);await tick();
  assert.equal(h.calls.length, 2);
  reply(h.calls[1],7);await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent,'7');
  h.clock.advance(3600000);
  assert.equal(h.calls.length, 2);
});

test('hidden tabs defer storage updates and returning refreshes once', async () => {
  const h=setup();
  document.visibilityState='hidden';
  const event=new Event('storage');event.key='mrp:reaction-change';event.newValue=JSON.stringify({slug:'test'});
  window.dispatchEvent(event);h.clock.advance(3600000);
  assert.equal(h.calls.length,0);
  document.visibilityState='visible';
  document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));
  h.clock.advance(50);
  assert.equal(h.calls.length,1);
  reply(h.calls[0],8);await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent,'8');
});
