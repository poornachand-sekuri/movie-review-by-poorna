import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function setup() {
  const nodes = new Map();
  const node = (selector) => {
    if (nodes.has(selector)) return nodes.get(selector);
    const values = new Set();
    const listeners = new Map();
    const element = {
      value: '', textContent: '', innerHTML: '', dataset: {}, disabled: false,
      classList: { add: (...names) => names.forEach(n => values.add(n)), remove: (...names) => names.forEach(n => values.delete(n)),
        contains: n => values.has(n), toggle: (n, enabled) => enabled ? values.add(n) : values.delete(n) },
      addEventListener: (type, callback) => listeners.set(type, callback),
      emit: (type, event = { preventDefault() {} }) => listeners.get(type)?.(event),
      querySelector: node, querySelectorAll: () => [], reset() {}, focus() {},
    };
    nodes.set(selector, element);
    return element;
  };
  const calls = [];
  const locations = [];
  const context = {
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {} },
    window: { addEventListener() {}, scrollTo() {} },
    location: { replace: path => locations.push(path) },
    fetch: (path, options) => new Promise((resolve, reject) => calls.push({ path, options, resolve, reject })),
    FormData, URL, setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1,
  };
  runInNewContext(readFileSync('public/admin/admin.js', 'utf8'), context);
  // Leave session boot pending: these tests exercise the authenticated document's controls.
  calls.shift();
  return { node, calls, locations };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('logout sends one request, waits for it, then reloads the server-authenticated route', async () => {
  const h = setup();
  const first = h.node('#logoutBtn').emit('click');
  await h.node('#logoutBtn').emit('click');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].path, '/api/admin/logout');
  assert.equal(h.calls[0].options.method, 'POST');
  assert.deepEqual(h.locations, []);
  h.calls[0].resolve(Response.json({ ok: true }));
  await first;
  assert.deepEqual(h.locations, ['/admin/']);
});

test('logout returns to server authentication even after a network failure', async () => {
  const h = setup();
  const completion = h.node('#logoutBtn').emit('click');
  h.calls[0].reject(new Error('offline'));
  await completion;
  assert.deepEqual(h.locations, ['/admin/']);
});

test('saving uses the returned canonical record and next save updates its ID without rereading detail', async () => {
  const h = setup();
  h.node('#newReviewBtn').emit('click');
  h.node('#title').value = 'New title';
  h.node('#reviewEditor').innerHTML = '<p>Draft</p>';
  const completion = h.node('#reviewForm').emit('submit');
  assert.equal(h.calls[0].path, '/api/admin/reviews');
  assert.equal(h.calls[0].options.method, 'POST');
  const canonical = { i: 42, t: 'Canonical title', s: 'canonical-title', d: '2026-09-10', body: '<p>Saved</p>',
    gallery: ['/saved.webp'], cast_crew: { actors: ['Actor'] } };
  h.calls[0].resolve(Response.json({ review: canonical }));
  await tick();
  assert.equal(h.calls[1].path, '/api/admin/reviews?compact=1');
  h.calls[1].resolve(Response.json([canonical]));
  await completion;
  assert.equal(h.calls.length, 2);
  assert.equal(h.node('#title').value, canonical.t);
  assert.equal(h.node('#reviewEditor').innerHTML, canonical.body);
  assert.equal(h.node('#actors').value, 'Actor');
  assert.match(h.node('#galleryGrid').innerHTML, /saved.webp/);
  h.node('#reviewForm').emit('submit');
  assert.equal(h.calls[2].path, '/api/admin/reviews/42');
  assert.equal(h.calls[2].options.method, 'PUT');
});
