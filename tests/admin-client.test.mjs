import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createClock } from './helpers/clock.mjs';

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
  const clock = createClock();
  const document = Object.assign(new EventTarget(), { querySelector: node, querySelectorAll: () => [], visibilityState: 'visible' });
  const window = Object.assign(new EventTarget(), { scrollTo() {} });
  const context = {
    document, window,
    location: { replace: path => locations.push(path) },
    fetch: (path, options) => new Promise((resolve, reject) => calls.push({ path, options, resolve, reject })),
    FormData, URL, ...clock,
  };
  runInNewContext(readFileSync('public/admin/admin.js', 'utf8'), context);
  // Leave session boot pending: these tests exercise the authenticated document's controls.
  const boot = calls.shift();
  return { node, calls, locations, boot, clock, document, window };
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

test('dashboard has no idle polling, coalesces return events and fetches the latest selected range', async () => {
  const h = setup();
  h.node('#analyticsDays').value = '7';
  h.boot.resolve(Response.json({ authenticated: true }));
  await tick();
  assert.equal(h.calls.length, 1);
  h.calls[0].resolve(Response.json({ views: 10 })); await tick();
  h.clock.advance(3600000);
  assert.equal(h.calls.length, 1);
  h.window.dispatchEvent(new Event('focus'));
  h.document.dispatchEvent(new Event('visibilitychange'));
  h.clock.advance(50);
  assert.equal(h.calls.length, 2);
  h.node('#analyticsDays').value = '30';
  h.node('#analyticsDays').emit('change');
  h.node('#analyticsDays').value = '90';
  h.node('#analyticsDays').emit('change');
  assert.equal(h.calls.length, 2, 'range changes do not start overlapping requests');
  h.calls[1].resolve(Response.json({ views: 20 })); await tick();
  assert.equal(h.node('#metricViews').textContent, '10', 'old range cannot replace the displayed metrics');
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].path, '/api/admin/analytics?days=90');
  h.calls[2].resolve(Response.json({ views: 90 })); await tick();
  assert.equal(h.node('#metricViews').textContent, '90');
  h.document.visibilityState = 'hidden';
  const event = new Event('storage'); event.key = 'mrp:reaction-change';
  h.window.dispatchEvent(event);h.clock.advance(3600000);
  assert.equal(h.calls.length, 3);
  h.document.visibilityState = 'visible';
  h.document.dispatchEvent(new Event('visibilitychange'));h.window.dispatchEvent(new Event('focus'));
  h.clock.advance(50);
  assert.equal(h.calls.length, 4);
});
