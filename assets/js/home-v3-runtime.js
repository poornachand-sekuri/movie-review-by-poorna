/* Home V3 canonical runtime.
   One runtime owns navigation, section popovers, POV fitting and card title
   fitting. Legacy observers installed by home-v3.js are detached by replacing
   the visible text nodes once after render. */

const CAFE_HREF = '/cine-cafe/';
const PREVIEW_REVIEW_ORIGIN = 'https://moviereviewbypoorna.com';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let resizeTimer = 0;

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

function detachLegacyObservedText(page) {
  const selectors = ['.hm3-pov', '.hm3-recent-title', '.hm3-prev-title'];
  selectors.forEach(selector => {
    $$(selector, page).forEach(node => {
      if (node.dataset.canonicalText === 'true') return;
      const clone = node.cloneNode(true);
      clone.dataset.canonicalText = 'true';
      clone.classList.remove('is-marquee', 'is-overflowing', 'hm3-scroll-title');
      clone.style.removeProperty('--hm3-marquee-duration');
      clone.style.removeProperty('--hm3-scroll-distance');
      clone.style.removeProperty('font-size');
      clone.style.removeProperty('line-height');
      const track = $('.hm3-title-track', clone);
      if (track) {
        while (track.children.length > 1) track.lastElementChild.remove();
        const copy = $('.hm3-title-copy', track);
        if (copy) {
          copy.style.removeProperty('transform');
          copy.getAnimations?.().forEach(animation => animation.cancel());
        }
      }
      node.replaceWith(clone);
    });
  });
}

function fitsBox(node) {
  return node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1;
}

function binaryFit(node, low, high, lineHeight, iterations = 16) {
  let best = low;
  node.style.lineHeight = String(lineHeight);
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    node.style.fontSize = `${mid}px`;
    if (fitsBox(node)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  node.style.fontSize = `${best}px`;
  return fitsBox(node);
}

function fitPov(pov, options = {}) {
  if (!pov?.isConnected || !pov.textContent.trim() || !pov.clientWidth || !pov.clientHeight) return;

  pov.style.removeProperty('font-size');
  pov.style.removeProperty('line-height');
  const css = getComputedStyle(pov);
  const cssPreferred = Number.parseFloat(css.fontSize) || 9;
  const preferred = Number(options.preferred) > 0 ? Number(options.preferred) : cssPreferred;
  const softFloor = Number(options.softFloor) > 0 ? Number(options.softFloor) : Math.max(6.8, preferred * 0.78);
  const emergencyFloor = Number(options.emergencyFloor) > 0 ? Number(options.emergencyFloor) : Math.max(5.6, preferred * 0.62);

  const stages = [
    { line: 1.20, floor: softFloor },
    { line: 1.15, floor: softFloor },
    { line: 1.10, floor: emergencyFloor }
  ];

  for (const stage of stages) {
    pov.style.lineHeight = String(stage.line);
    pov.style.fontSize = `${preferred}px`;
    if (fitsBox(pov)) return;
    pov.style.fontSize = `${stage.floor}px`;
    if (fitsBox(pov)) {
      binaryFit(pov, stage.floor, preferred, stage.line);
      return;
    }
  }

  /* Last-resort containment. This path is intentionally rare and exists only
     for unusually long future POV copy; it always prefers complete text over
     silently clipping the ending. */
  pov.style.lineHeight = '1.06';
  binaryFit(pov, 4.9, Math.max(emergencyFloor, 5.2), 1.06, 14);
}

function fitCardTitle(title) {
  if (!title?.isConnected || !title.textContent.trim() || !title.clientWidth || !title.clientHeight) return;
  title.classList.remove('is-marquee', 'is-overflowing', 'hm3-scroll-title');
  title.style.removeProperty('--hm3-marquee-duration');
  title.style.removeProperty('--hm3-scroll-distance');
  const track = $('.hm3-title-track', title);
  if (track) {
    while (track.children.length > 1) track.lastElementChild.remove();
    const copy = $('.hm3-title-copy', track);
    if (copy) {
      copy.style.removeProperty('transform');
      copy.getAnimations?.().forEach(animation => animation.cancel());
    }
  }

  title.style.removeProperty('font-size');
  const preferred = Number.parseFloat(getComputedStyle(title).fontSize) || 7;
  const isPrevious = title.classList.contains('hm3-prev-title');
  const floor = isPrevious ? 4.15 : 4.75;
  title.style.fontSize = `${preferred}px`;
  if (fitsBox(title)) return;
  title.style.fontSize = `${floor}px`;
  if (!fitsBox(title)) return;
  binaryFit(title, floor, preferred, 1.04, 14);
}

function fitAll(page) {
  fitPov($('.hm3-pov', page));
  $$('.hm3-recent-title, .hm3-prev-title', page).forEach(fitCardTitle);
}

function wireNavigation(page) {
  page.addEventListener('click', event => {
    const menu = event.target.closest('.hm3-menu');
    if (menu) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign('/');
      return;
    }

    const cafeTarget = event.target.closest('.hm3-search, .hm3-recent-view-all, .hm3-previous-view-all, .hm3-cafe-nav');
    if (cafeTarget) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(CAFE_HREF);
      return;
    }

    const readMore = event.target.closest('.hm3-read-review');
    if (readMore) {
      event.preventDefault();
      event.stopImmediatePropagation();
      location.assign(readMore.href);
    }
  }, true);

  const top = $('.hm3-top-section', page);
  if (top && !$('.hm3-logo-home', top)) {
    const logo = document.createElement('a');
    logo.className = 'hm3-logo-home';
    logo.href = '/';
    logo.setAttribute('aria-label', 'Go to Home');
    top.append(logo);
  }
  $('.hm3-menu', page)?.setAttribute('aria-label', 'Go to Home');

  if (location.hostname.endsWith('.workers.dev')) {
    $$('.hm3-now-poster, .hm3-read-review, .hm3-recent-card, .hm3-prev-card', page).forEach(link => {
      try {
        const url = new URL(link.getAttribute('href') || '', location.href);
        const slug = url.searchParams.get('review');
        if (slug) link.href = `${PREVIEW_REVIEW_ORIGIN}/?review=${encodeURIComponent(slug)}`;
      } catch {}
    });
  }
}

function snapshotTypography(source) {
  const selectors = ['.hm3-now-title', '.hm3-now-meta', '.hm3-now-label', '.hm3-pov'];
  return Object.fromEntries(selectors.map(selector => {
    const node = $(selector, source);
    const style = node ? getComputedStyle(node) : null;
    return [selector, node && style ? {
      fontSize: Number.parseFloat(style.fontSize) || 0,
      lineHeight: Number.parseFloat(style.lineHeight) || 0
    } : null];
  }));
}

function applyPopupTypography(source, typography, scale) {
  const title = $('.hm3-now-title', source);
  const meta = $('.hm3-now-meta', source);
  const label = $('.hm3-now-label', source);
  const pov = $('.hm3-pov', source);

  for (const [selector, node] of [['.hm3-now-title', title], ['.hm3-now-meta', meta], ['.hm3-now-label', label]]) {
    const base = typography[selector]?.fontSize || 0;
    if (node && base) node.style.fontSize = `${Math.min(base * scale, base * 1.9)}px`;
  }

  if (pov) {
    const base = typography['.hm3-pov']?.fontSize || Number.parseFloat(getComputedStyle(pov).fontSize) || 9;
    const preferred = base * scale;
    fitPov(pov, {
      preferred,
      softFloor: Math.max(base * 1.08, preferred * 0.76),
      emergencyFloor: Math.max(base, preferred * 0.62)
    });
  }
}

function clearPopupTypography(source) {
  ['.hm3-now-title', '.hm3-now-meta', '.hm3-now-label', '.hm3-pov'].forEach(selector => {
    const node = $(selector, source);
    node?.style.removeProperty('font-size');
    node?.style.removeProperty('line-height');
  });
}

function wireExpandableSection(page, selector, options = {}) {
  const source = $(selector, page);
  if (!source || source.dataset.popupWired === 'true') return;
  source.dataset.popupWired = 'true';

  let modal = null;
  let shell = null;
  let placeholder = null;
  let previousFocus = null;
  let sourceWidth = 0;
  let sourceAspect = 1;
  let typography = null;

  const closePopup = () => {
    if (!modal || !placeholder) return;
    window.removeEventListener('resize', refreshPopup);
    placeholder.replaceWith(source);
    source.classList.remove('hm3-section-modal-card');
    source.removeAttribute('data-popup-active');
    source.style.removeProperty('--hm3-popup-aspect');
    clearPopupTypography(source);
    modal.remove();
    modal = null;
    shell = null;
    placeholder = null;
    document.documentElement.classList.remove('hm3-section-modal-open');
    document.body.classList.remove('hm3-section-modal-open');
    requestAnimationFrame(() => fitAll(page));
    if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll:true });
  };

  const refreshPopup = () => {
    if (!modal || !shell) return;
    const viewportWidth = Math.max(280, window.innerWidth || document.documentElement.clientWidth || 520);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720);
    const aspect = Number(options.popupAspect) > 0 ? Number(options.popupAspect) : sourceAspect;
    const maxWidth = Math.min(viewportWidth * 0.97, 720);
    const availableHeight = Math.max(220, viewportHeight - 62);
    const fittedWidth = Math.max(240, Math.min(maxWidth, availableHeight * aspect));
    shell.style.width = `${Math.floor(fittedWidth)}px`;
    source.style.setProperty('--hm3-popup-aspect', String(aspect));

    requestAnimationFrame(() => {
      if (options.fitPov && typography) {
        const scale = Math.max(1.18, Math.min(1.85, fittedWidth / Math.max(sourceWidth, 1)));
        applyPopupTypography(source, typography, scale);
      }
      $$('.hm3-recent-title, .hm3-prev-title', source).forEach(fitCardTitle);
    });
  };

  const openPopup = () => {
    if (modal) return;
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    sourceWidth = rect.width;
    sourceAspect = rect.width / rect.height;
    typography = options.fitPov ? snapshotTypography(source) : null;
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
    modal.addEventListener('click', event => { if (event.target === modal) closePopup(); });
    window.addEventListener('resize', refreshPopup, { passive:true });
    refreshPopup();
    document.fonts?.ready?.then(refreshPopup).catch(() => {});
    requestAnimationFrame(() => closeButton.focus({ preventScroll:true }));
  };

  source.addEventListener('click', event => {
    if (modal) return;
    const protectedTarget = event.target.closest(options.preserveInteractive || 'a,button,input,textarea,select,label,form');
    if (protectedTarget && source.contains(protectedTarget)) return;
    event.preventDefault();
    event.stopPropagation();
    openPopup();
  });
}

function wireExpandableSections(page) {
  wireExpandableSection(page, '.hm3-now-section', {
    label:'Now Reviewed',
    popupAspect:1.60,
    fitPov:true,
    preserveInteractive:'.hm3-now-poster, .hm3-read-review, a, button, input, textarea, select, label, form'
  });
  wireExpandableSection(page, '.hm3-recent-section', { label:'Recent Reviews' });
  wireExpandableSection(page, '.hm3-previous-section', { label:'Previously Reviewed' });
  wireExpandableSection(page, '.hm3-share-section', {
    label:'Share Your Opinion',
    preserveInteractive:'a,button,input,textarea,select,label,form,.hm3-comment-list,.hm3-comment-form'
  });
}

async function install() {
  const page = await waitForHome();
  detachLegacyObservedText(page);
  wireNavigation(page);
  wireExpandableSections(page);

  const refit = () => requestAnimationFrame(() => fitAll(page));
  refit();
  setTimeout(refit, 120);
  setTimeout(refit, 650);
  document.fonts?.ready?.then(() => { refit(); setTimeout(refit, 80); }).catch(() => {});

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refit, 120);
  }, { passive:true });
}

install().catch(error => console.error('Unable to install Home V3 canonical runtime:', error));
