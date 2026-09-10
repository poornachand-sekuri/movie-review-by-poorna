import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const totals = { views: 42, uniqueVisitors: 12, reviewCount: 137, reactionTotals: { like: 9, dislike: 2 } };

function setup({ sessionStatus = 200, analytics = () => Response.json(totals) } = {}) {
  const nodes = new Map();
  const requests = [];
  const intervals = [];
  const timeouts = [];
  function node(selector) {
    if (!nodes.has(selector)) {
      const values = new Set(['hidden']);
      nodes.set(selector, Object.assign(new EventTarget(), {
        value: '30', disabled: false, textContent: '', innerHTML: '', dataset: {},
        classList: {
          add: (value) => values.add(value), remove: (value) => values.delete(value),
          contains: (value) => values.has(value),
          toggle: (value, enabled) => enabled ? values.add(value) : values.delete(value),
        },
        focus() {},
      }));
    }
    return nodes.get(selector);
  }
  const tabs = ['dashboard', 'comments', 'reviews'].map((panel) => {
    const tab = node(`tab:${panel}`);
    tab.dataset.panel = panel;
    return tab;
  });
  const document = Object.assign(new EventTarget(), {
    querySelector: node,
    querySelectorAll: (selector) => selector === '.nav-tab' ? tabs : [],
    visibilityState: 'visible',
  });
  const window = new EventTarget();
  vm.runInNewContext(source, {
    document, window, FormData, URLSearchParams,
    setInterval: (callback) => intervals.push(callback),
    setTimeout: (callback) => timeouts.push(callback), clearTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url === '/api/admin/session') return Response.json({}, { status: sessionStatus });
      if (url.startsWith('/api/admin/analytics?')) return analytics();
      return Response.json({});
    },
  });
  return {
    node, document, window, requests,
    analyticsRequests: () => requests.filter(({ url }) => url.startsWith('/api/admin/analytics?')),
    async backgroundActivity() {
      window.dispatchEvent(new Event('focus'));
      for (const visibility of ['hidden', 'visible']) {
        document.visibilityState = visibility;
        document.dispatchEvent(new Event('visibilitychange'));
      }
      window.dispatchEvent(Object.assign(new Event('storage'), { key: 'mrp:reaction-change' }));
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
      for (const callback of [...intervals, ...timeouts]) callback();
      await tick();
    },
  };
}

test('idle and browser events do not repeat the initial dashboard query', async () => {
  const h = setup();
  await tick();
  assert.equal(h.analyticsRequests().length, 1);
  assert.equal(h.node('#metricViews').textContent, '42');
  assert.equal(h.node('#metricLikes').textContent, '9');
  await h.backgroundActivity();
  assert.equal(h.analyticsRequests().length, 1);
});

test('manual refresh, date-range changes and dashboard navigation still fetch current totals', async () => {
  const h = setup();
  await tick();
  for (const selector of ['#refreshAnalytics', '#syncReactions']) {
    h.node(selector).dispatchEvent(new Event('click'));
    await tick();
  }
  h.node('#analyticsDays').value = '7';
  h.node('#analyticsDays').dispatchEvent(new Event('change'));
  await tick();
  h.node('tab:comments').dispatchEvent(new Event('click'));
  await tick();
  h.node('tab:dashboard').dispatchEvent(new Event('click'));
  await tick();
  assert.deepEqual(h.analyticsRequests().map(({ url }) => url), [
    '/api/admin/analytics?days=30', '/api/admin/analytics?days=30',
    '/api/admin/analytics?days=30', '/api/admin/analytics?days=7',
    '/api/admin/analytics?days=7',
  ]);
  assert(h.analyticsRequests().every(({ credentials }) => credentials === 'same-origin'));
  assert.equal(h.node('#metricDislikes').textContent, '2');
});

test('rapid refresh clicks share one in-flight request and allow a later refresh', async () => {
  let reply;
  const h = setup({ analytics: () => new Promise((resolve) => { reply = resolve; }) });
  await tick();
  h.node('#refreshAnalytics').dispatchEvent(new Event('click'));
  h.node('#syncReactions').dispatchEvent(new Event('click'));
  assert.equal(h.analyticsRequests().length, 1);
  reply(Response.json(totals));
  await tick();
  assert.equal(h.node('#refreshAnalytics').disabled, false);
  h.node('#refreshAnalytics').dispatchEvent(new Event('click'));
  assert.equal(h.analyticsRequests().length, 2);
  reply(Response.json({ ...totals, views: 43 }));
  await tick();
  assert.equal(h.node('#metricViews').textContent, '43');
});

test('quota errors stop background requests and permit an explicit recovery attempt', async () => {
  let unavailable = true;
  const h = setup({ analytics: () => unavailable
    ? Response.json({ error: 'D1 daily read allowance exceeded' }, { status: 500 })
    : Response.json(totals) });
  await tick();
  assert.match(h.node('#toast').textContent, /allowance exceeded/);
  await h.backgroundActivity();
  assert.equal(h.analyticsRequests().length, 1);
  unavailable = false;
  h.node('#refreshAnalytics').dispatchEvent(new Event('click'));
  await tick();
  assert.equal(h.analyticsRequests().length, 2);
  assert.equal(h.node('#metricViews').textContent, '42');
});

test('unauthenticated admin pages never request analytics in the background', async () => {
  const h = setup({ sessionStatus: 401 });
  await tick();
  await h.backgroundActivity();
  assert.equal(h.analyticsRequests().length, 0);
  assert.equal(h.node('#adminView').classList.contains('hidden'), true);
});
