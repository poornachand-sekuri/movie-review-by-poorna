const CAFE_HREF = '/cine-cafe/';
const PREVIEW_REVIEW_ORIGIN = 'https://moviereviewbypoorna.com';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function waitForHome() {
  const existing = $('.hm3-page');
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const page = $('.hm3-page');
      if (!page) return;
      observer.disconnect();
      resolve(page);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function wireCafeNavigation(page) {
  const selectors = [
    '.hm3-search',
    '.hm3-recent-view-all',
    '.hm3-previous-view-all',
    '.hm3-cafe-nav'
  ].join(',');

  page.addEventListener('click', event => {
    const target = event.target.closest(selectors);
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(CAFE_HREF);
  }, true);
}

function wireReviewLinks(page) {
  if (!location.hostname.endsWith('.workers.dev')) return;

  $$('.hm3-now-poster, .hm3-read-review, .hm3-recent-card, .hm3-prev-card', page).forEach(link => {
    const url = new URL(link.getAttribute('href') || '', location.href);
    const slug = url.searchParams.get('review');
    if (!slug) return;
    link.href = `${PREVIEW_REVIEW_ORIGIN}/?review=${encodeURIComponent(slug)}`;
  });
}

function prepareScrollingTitle(title) {
  if (!title || title.dataset.scrollPrepared === 'true') return;

  const text = title.textContent.trim();
  title.textContent = '';
  title.classList.add('hm3-scroll-title');
  title.dataset.scrollPrepared = 'true';

  const inner = document.createElement('span');
  inner.className = 'hm3-title-scroll';
  inner.textContent = text;
  title.append(inner);
}

function updateScrollingTitles(page) {
  $$('.hm3-now-title, .hm3-recent-title, .hm3-prev-title', page).forEach(title => {
    prepareScrollingTitle(title);
    const inner = $('.hm3-title-scroll', title);
    if (!inner) return;

    title.classList.remove('is-overflowing');
    title.style.removeProperty('--hm3-scroll-distance');

    const distance = Math.max(0, Math.ceil(inner.scrollWidth - title.clientWidth));
    if (distance > 2) {
      title.style.setProperty('--hm3-scroll-distance', `${distance}px`);
      title.classList.add('is-overflowing');
    }
  });
}

async function init() {
  const page = await waitForHome();
  wireCafeNavigation(page);
  wireReviewLinks(page);

  const refreshTitles = () => requestAnimationFrame(() => updateScrollingTitles(page));
  refreshTitles();
  document.fonts?.ready?.then(refreshTitles).catch(() => {});

  if ('ResizeObserver' in window) {
    const stage = $('.hm3-stage', page);
    if (stage) new ResizeObserver(refreshTitles).observe(stage);
  } else {
    window.addEventListener('resize', refreshTitles, { passive: true });
  }
}

init().catch(error => console.error('Unable to apply Home refinements:', error));
