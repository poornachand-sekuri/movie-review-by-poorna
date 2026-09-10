import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(logoutResponse) {
  const nodes = new Map();
  const requests = [];
  const redirects = [];
  function node(selector) {
    if (!nodes.has(selector)) {
      const values = new Set(['hidden']);
      nodes.set(selector, {
        value: '30', disabled: false, textContent: '', innerHTML: '', listeners: new Map(),
        classList: {
          add: (value) => values.add(value), remove: (value) => values.delete(value),
          contains: (value) => values.has(value),
          toggle: (value, enabled) => enabled ? values.add(value) : values.delete(value),
        },
        addEventListener(name, listener) { this.listeners.set(name, listener); },
        focus() {},
      });
    }
    return nodes.get(selector);
  }
  vm.runInNewContext(source, {
    document: { querySelector: node, querySelectorAll: () => [], addEventListener() {}, visibilityState: 'visible' },
    window: { addEventListener() {} },
    location: { replace: (url) => redirects.push(url) },
    setTimeout() {}, clearTimeout() {}, setInterval() {}, FormData,
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url === '/api/admin/logout') return logoutResponse();
      return Response.json({});
    },
  });
  return { node, requests, redirects };
}

test('Projector Room logout makes one authenticated request and reloads the protected route', async () => {
  let reply;
  const h = setup(() => new Promise((resolve) => { reply = resolve; }));
  await tick();
  const button = h.node('#logoutBtn');
  const click = button.listeners.get('click');
  const event = { preventDefault() {} };
  const pending = click(event);
  await click(event);
  const calls = h.requests.filter((request) => request.url === '/api/admin/logout');
  assert.equal(calls.length, 1, 'rapid repeated clicks do not send duplicate requests');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].credentials, 'same-origin');
  assert.equal(calls[0].body, '{}');
  assert.deepEqual(h.redirects, []);
  reply(Response.json({ ok: true }));
  await pending;
  assert.deepEqual(h.redirects, ['/admin/']);
});

test('logout failures still return through the server authentication boundary', async () => {
  for (const response of [
    () => Promise.reject(new Error('Network unavailable')),
    () => Response.json({ error: 'Unavailable' }, { status: 503 }),
  ]) {
    const h = setup(response);
    await tick();
    await h.node('#logoutBtn').listeners.get('click')({ preventDefault() {} });
    assert.deepEqual(h.redirects, ['/admin/']);
  }
});
