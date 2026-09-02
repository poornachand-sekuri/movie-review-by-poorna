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

function wireExpandableSection(page, selector, options = {}) {
  const source = $(selector, page);
  if (!source || source.dataset.popupWired === 'true') return;
  source.dataset.popupWired = 'true';

  let modal = null;
  let shell = null;
  let placeholder = null;
  let previousFocus = null;
  let sourceAspect = 1;
  let popupAspect = 1;

  const refreshPopup = () => {
    if (!modal || !shell) return;

    const viewportWidth = Math.max(280, window.innerWidth || document.documentElement.clientWidth || 520);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720);
    const widthFraction = viewportWidth <= 480 ? 0.97 : 0.96;
    const maxWidth = Math.min(viewportWidth * widthFraction, 720);
    const availableHeight = Math.max(220, viewportHeight - (viewportWidth <= 480 ? 54 : 58));
    const fittedWidth = Math.max(240, Math.min(maxWidth, availableHeight * popupAspect));

    shell.style.width = `${Math.floor(fittedWidth)}px`;
    source.style.setProperty('--hm3-popup-aspect', String(popupAspect));

    requestAnimationFrame(() => {
      updateScrollingTitles(source);
      if (options.fitPov) fitResponsivePov($('.hm3-pov', source), 15);
    });
  };

  const handleKeydown = event => {
    if (event.key === 'Escape') closePopup();
  };

  const closePopup = () => {
    if (!modal || !placeholder) return;

    window.removeEventListener('resize', refreshPopup);
    document.removeEventListener('keydown', handleKeydown);

    placeholder.replaceWith(source);
    source.classList.remove('hm3-section-modal-card');
    source.style.removeProperty('--hm3-popup-aspect');
    source.removeAttribute('data-popup-active');

    modal.remove();
    modal = null;
    shell = null;
    placeholder = null;

    document.documentElement.classList.remove('hm3-section-modal-open');
    document.body.classList.remove('hm3-section-modal-open');

    requestAnimationFrame(() => {
      updateScrollingTitles(source);
      if (options.fitPov) fitResponsivePov($('.hm3-pov', source), 12);
    });

    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
  };

  const openPopup = () => {
    if (modal) return;

    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    sourceAspect = rect.width / rect.height;
    popupAspect = Number(options.popupAspect) > 0 ? Number(options.popupAspect) : sourceAspect;
    previousFocus = document.activeElement;

    placeholder = document.createElement('div');
    placeholder.className = `${source.className} hm3-section-placeholder`;
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.style.setProperty('--hm3-source-aspect', String(sourceAspect));
    source.parentNode.insertBefore(placeholder, source);

    modal = document.createElement('div');
    modal.className = 'hm3-section-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', `${options.label || 'Section'} expanded`);

    shell = document.createElement('div');
    shell.className = 'hm3-section-modal-shell';

    source.classList.add('hm3-section-modal-card');
    source.dataset.popupActive = 'true';

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'hm3-section-modal-close';
    closeButton.setAttribute('aria-label', `Close enlarged ${options.label || 'section'}`);
    closeButton.textContent = '×';

    shell.append(source, closeButton);
    modal.append(shell);
    page.append(modal);

    document.documentElement.classList.add('hm3-section-modal-open');
    document.body.classList.add('hm3-section-modal-open');

    closeButton.addEventListener('click', closePopup);
    modal.addEventListener('click', event => {
      if (event.target === modal) closePopup();
    });

    window.addEventListener('resize', refreshPopup, { passive: true });
    document.addEventListener('keydown', handleKeydown);

    refreshPopup();
    document.fonts?.ready?.then(refreshPopup).catch(() => {});
    requestAnimationFrame(() => closeButton.focus({ preventScroll: true }));
  };

  source.addEventListener('click', event => {
    if (modal) return;

    if (options.preserveInteractive) {
      const protectedTarget = event.target.closest(options.preserveInteractive);
      if (protectedTarget && source.contains(protectedTarget)) return;
    }

    event.preventDefault();
    event.stopPropagation();
    openPopup();
  });
}

function wireExpandableSections(page) {
  wireExpandableSection(page, '.hm3-now-section', {
    label: 'Now Reviewed',
    popupAspect: 1.60,
    fitPov: true
  });

  wireExpandableSection(page, '.hm3-recent-section', {
    label: 'Recent Reviews',
    preserveInteractive: 'a, button, input, textarea, select, label, form'
  });

  wireExpandableSection(page, '.hm3-previous-section', {
    label: 'Previously Reviewed',
    preserveInteractive: 'a, button, input, textarea, select, label, form'
  });

  wireExpandableSection(page, '.hm3-share-section', {
    label: 'Share Your Opinion',
    preserveInteractive: 'a, button, input, textarea, select, label, form, .hm3-comment-list, .hm3-comment-form'
  });
}

async function init() {
  const page = await waitForHome();
  wireCafeNavigation(page);
  wireReviewLinks(page);
  wireResponsivePov(page);
  wireExpandableSections(page);

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
