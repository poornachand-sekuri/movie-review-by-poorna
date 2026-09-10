import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { installBindings } from './helpers/d1.mjs';
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
  let timer, interval;
  const window = Object.assign(new EventTarget(), { location: { search: '' }, matchMedia: () => ({ matches: false }),
    setInterval: (callback, ms) => { timer = callback; interval = ms; return 1; }, clearInterval() {} });
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
  assert.equal(interval, 15000);
  get('pagination').children.find(child => child.attributes.get('aria-label') === 'Next page').dispatchEvent(new Event('click'));
  assert.equal(get('serving-range').textContent, '7–12');
  assert.equal(requests.length, 1);
  get('search').value = 'Movie 1';
  get('search').dispatchEvent(new Event('input'));
  assert.equal(get('serving-range').textContent, '1–6');
  assert.equal(get('serving-total').textContent, '6');
  assert.equal(requests.length, 2);
  document.visibilityState = 'hidden'; timer();
  assert.equal(requests.length, 2, 'hidden tabs do not poll');
  document.visibilityState = 'visible'; timer();
  assert.equal(requests.length, 3);
  get('clear').dispatchEvent(new Event('click'));
  assert.equal(get('serving-total').textContent, '14');
  assert.equal(get('search').value, '');
  assert(get('search').focused);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '3'));
  const pending = [];
  globalThis.fetch = url => new Promise(resolve => pending.push({ url, resolve }));
  timer(); timer();
  const reply = (index, likes) => pending[index].resolve(Response.json({ counts:
    new URL(pending[index].url, 'https://example.com').searchParams.getAll('slug').map(slug => ({ slug, likes })) }));
  reply(1, 9); await flush();
  reply(0, 1); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'late older response cannot overwrite current counts');
  timer(); reply(2, -1); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'malformed counts preserve the last confirmed value');
  timer(); pending[3].resolve(new Response('', { status: 503 })); await flush();
  assert(results.querySelectorAll().every(card => card.likeNode.textContent === '9'), 'temporary failures preserve confirmed counts');
});
