import assert from 'node:assert/strict';
import test from 'node:test';
import { initAuditoriumReactions } from '../src/lib/auditorium-reactions.ts';

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
  globalThis.document = { querySelector: () => root };
  globalThis.window = new EventTarget();
  const calls = [];
  globalThis.fetch = (url, options) => new Promise((resolve) => calls.push({ url, ...options, resolve }));
  initAuditoriumReactions();
  return { root, nodes, calls, restorePage() {
    const event = new Event('pageshow'); event.persisted = true; window.dispatchEvent(event);
  } };
}
const reply = (call, likes, viewerReaction = null) => call.resolve(Response.json({ likes, dislikes: 0, viewerReaction }));

test('server-rendered reactions need no duplicate request; restored pages refresh', async () => {
  const h = setup();
  assert.equal(h.calls.length, 0);
  h.restorePage();
  assert.equal(h.calls[0].method, 'GET');
  reply(h.calls[0], 4);
  await tick();
  assert.equal(h.nodes.get('[data-reaction-count="like"]').textContent, '4');
});

test('an older refresh cannot overwrite a completed vote', async () => {
  const h = setup();
  h.restorePage();
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
