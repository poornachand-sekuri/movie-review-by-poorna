import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { installBindings } from './helpers/d1.mjs';
import { createClock } from './helpers/clock.mjs';
installBindings({});
const { initCiniCafe } = await import('../src/lib/cini-cafe.ts');
const { renderCafeCard } = await import('../src/lib/cini-cafe-card.ts');

class Node extends EventTarget {
  value = ''; textContent = ''; innerHTML = ''; children = []; dataset = {}; attributes = new Map();
  appendChild(child) { this.children.push(child); }
  replaceChildren() { this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  toggleAttribute(name, enabled) { enabled ? this.attributes.set(name, '') : this.attributes.delete(name); }
  focus() { this.focused = true; }
  scrollIntoView() {}
  querySelector() { return this.likeNode ?? null; }
  querySelectorAll() {
    if (this.parsedHTML !== this.innerHTML) {
      this.parsedHTML = this.innerHTML;
      this.cards = [...this.innerHTML.matchAll(/data-review-slug="([^"]+)"/g)].map((match) => {
        const card = new Node(); card.dataset.reviewSlug = match[1]; card.likeNode = new Node(); return card;
      });
    }
    return this.cards;
  }
}

test('Cafe controls attach to the rendered page and preserve search, paging and visible refresh behavior', async () => {
  const nodes = new Map();
  // Derive the available hooks from the real template, so a renamed selector fails this test.
  for (const match of readFileSync('src/pages/search.astro', 'utf8').matchAll(/\bdata-(cini-[\w-]+)/g)) {
    nodes.set(`[data-${match[1]}]`, new Node());
  }
  const catalogue = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, slug: `movie-${i+1}`, title: `Movie ${i+1}`,
    language: 'Telugu', reviewedDate: '2026-09-10', releaseDate: '2026-09-01', searchTerms: [], likes: 0 }));
  const catalogueNode = new Node(); catalogueNode.textContent = JSON.stringify(catalogue);
  nodes.set('#cini-cafe-catalogue', catalogueNode);
  const results = nodes.get('[data-cini-results]');
  results.innerHTML = catalogue.slice().reverse().slice(0,6).map(renderCafeCard).join('');
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible',
    querySelector: selector => nodes.get(selector) ?? null, createElement: () => new Node() });
  const clock = createClock();
  const window = Object.assign(new EventTarget(), { location: { search: '' }, matchMedia: () => ({ matches: false }),
    ...clock });
  globalThis.document = document;
  globalThis.window = window;
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(url);
    const slugs = new URL(url, 'https://example.com').searchParams.getAll('slug');
    assert(slugs.length > 0 && slugs.length <= 6);
    return Response.json({ counts: slugs.map(slug => ({ slug, likes: 3, dislikes: 0 })) });
  };
  initCiniCafe();
  const get = name => nodes.get(`[data-cini-${name}]`);
  assert.equal(get('serving-range').textContent, '1–6');
  assert.equal(get('serving-total').textContent, '14');
  assert.equal(get('language').children.length, 2);
  assert.equal(requests.length, 0, 'server-rendered initial counts need no duplicate fetch');
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const refresh = () => { window.dispatchEvent(new Event('focus')); clock.advance(50); };
  clock.advance(3600000);
  assert.equal(requests.length, 0, 'an idle Cafe does not query D1');
  get('pagination').children.find(child => child.attributes.get('aria-label') === 'Next page').dispatchEvent(new Event('click'));
  assert.equal(get('serving-range').textContent, '7–12');
  assert.equal(requests.length, 1);
  await flush();
  get('search').value = 'Movie 1';
  get('search').dispatchEvent(new Event('input'));
  assert.equal(get('serving-range').textContent, '1–6');
  assert.equal(get('serving-total').textContent, '6');
  assert.equal(requests.length, 1, 'typing does not immediately fetch counts');
  clock.advance(200);
  get('search').value = 'Movie 1 ';
  get('search').dispatchEvent(new Event('input'));
  clock.advance(299);
  assert.equal(requests.length, 1);
  clock.advance(1); await flush();
  assert.equal(requests.length, 2, 'one refresh follows the typing burst');
  get('search').value = 'movie 1';
  get('search').dispatchEvent(new Event('input'));
  clock.advance(300);
  assert.equal(requests.length, 2, 'unchanged visible reviews need no refresh');
  document.visibilityState = 'hidden'; refresh();
  const event = new Event('storage'); event.key = 'mrp:reaction-change'; event.newValue = JSON.stringify({slug:'movie-14'});
  window.dispatchEvent(event); clock.advance(3600000);
  assert.equal(requests.length, 2, 'hidden tabs defer updates');
  document.visibilityState = 'visible'; refresh(); await flush();
  assert.equal(requests.length, 3);
  get('clear').dispatchEvent(new Event('click'));
  assert.equal(get('serving-total').textContent, '14');
  assert.equal(get('search').value, '');
  assert(get('search').focused);
  await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '3'));
  const pending = [];
  globalThis.fetch = url => new Promise(resolve => pending.push({ url, resolve }));
  refresh(); refresh(); refresh();
  assert.equal(pending.length, 1, 'only one request is in flight');
  const reply = (index, likes) => pending[index].resolve(Response.json({ counts:
    new URL(pending[index].url, 'https://example.com').searchParams.getAll('slug').map(slug => ({ slug, likes })) }));
  reply(0, 1); await flush();
  assert.equal(pending.length, 2, 'a burst queues only one fresh follow-up');
  reply(1, 9); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'late older response cannot overwrite current counts');
  refresh(); reply(2, -1); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'malformed counts preserve the last confirmed value');
  refresh(); pending[3].resolve(new Response('', { status: 503 })); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'temporary failures preserve confirmed counts');
  clock.advance(3600000);
  assert.equal(pending.length, 4, 'failures do not cause background retry loops');
  const unrelated = new Event('storage'); unrelated.key = 'mrp:reaction-change'; unrelated.newValue = JSON.stringify({slug:'movie-1'});
  window.dispatchEvent(unrelated); clock.advance(50);
  assert.equal(pending.length, 4, 'off-page votes do not fetch unrelated counts');
});
