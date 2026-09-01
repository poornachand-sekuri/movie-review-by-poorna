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

function updateScrollingTitles(root) {
  $$('.hm3-now-title, .hm3-recent-title, .hm3-prev-title', root).forEach(title => {
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

function fitResponsivePov(container, maxCap = 12) {
  if (!container || !container.textContent.trim() || !container.clientWidth || !container.clientHeight) return;

  const widthBasedMax = container.clientWidth / 9;
  const maxPx = Math.max(7, Math.min(maxCap, widthBasedMax));
  const minPx = Math.max(5.5, Math.min(8, maxPx * 0.62));
  const fits = () => (
    container.scrollHeight <= container.clientHeight + 1 &&
    container.scrollWidth <= container.clientWidth + 1
  );

  container.style.fontSize = `${maxPx}px`;
  if (fits()) return;

  container.style.fontSize = `${minPx}px`;
  if (!fits()) return;

  let low = minPx;
  let high = maxPx;
  let best = minPx;

  for (let i = 0; i < 14; i += 1) {
    const mid = (low + high) / 2;
    container.style.fontSize = `${mid}px`;
    if (fits()) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  container.style.fontSize = `${best}px`;
}

function wireResponsivePov(page) {
  const copy = $('.hm3-now-copy', page);
  const pov = $('.hm3-pov', page);
  if (!copy || !pov) return;

  const fit = () => requestAnimationFrame(() => fitResponsivePov(pov, 12));
  fit();
  document.fonts?.ready?.then(fit).catch(() => {});

  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(copy);
  else window.addEventListener('resize', fit, { passive: true });
}

function wireNowReviewedPopup(page) {
  const source = $('.hm3-now-section', page);
  if (!source || source.dataset.popupWired === 'true') return;
  source.dataset.popupWired = 'true';

  let modal = null;
  let card = null;
  let previousFocus = null;
  let resizeHandler = null;

  const refreshPopup = () => {
    if (!card) return;
    requestAnimationFrame(() => {
      updateScrollingTitles(card);
      fitResponsivePov($('.hm3-pov', card), 15);
    });
  };

  const closePopup = () => {
    if (!modal) return;

    window.removeEventListener('resize', resizeHandler);
    document.removeEventListener('keydown', handleKeydown);
    modal.remove();
    modal = null;
    card = null;
    resizeHandler = null;
    document.documentElement.classList.remove('hm3-now-modal-open');
    document.body.classList.remove('hm3-now-modal-open');

    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  };

  const handleKeydown = event => {
    if (event.key === 'Escape') closePopup();
  };

  const openPopup = () => {
    if (modal) return;

    previousFocus = document.activeElement;
    modal = document.createElement('div');
    modal.className = 'hm3-now-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Now Reviewed expanded ticket');

    const shell = document.createElement('div');
    shell.className = 'hm3-now-modal-shell';

    card = source.cloneNode(true);
    card.classList.add('hm3-now-modal-card');
    card.dataset.popupWired = 'true';
    card.setAttribute('aria-label', 'Now Reviewed expanded');

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'hm3-now-modal-close';
    closeButton.setAttribute('aria-label', 'Close enlarged ticket');
    closeButton.textContent = '×';

    shell.append(card, closeButton);
    modal.append(shell);
    document.body.append(modal);
    document.documentElement.classList.add('hm3-now-modal-open');
    document.body.classList.add('hm3-now-modal-open');

    card.addEventListener('click', event => event.stopPropagation());
    closeButton.addEventListener('click', closePopup);
    modal.addEventListener('click', event => {
      if (event.target === modal) closePopup();
    });

    resizeHandler = refreshPopup;
    window.addEventListener('resize', resizeHandler, { passive: true });
    document.addEventListener('keydown', handleKeydown);

    refreshPopup();
    document.fonts?.ready?.then(refreshPopup).catch(() => {});
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  };

  source.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openPopup();
  });
}

async function init() {
  const page = await waitForHome();
  wireCafeNavigation(page);
  wireReviewLinks(page);
  wireResponsivePov(page);
  wireNowReviewedPopup(page);

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
