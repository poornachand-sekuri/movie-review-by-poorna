import { CONFIG } from './config.js';

const MASTER = 'https://assets.moviereviewbypoorna.com/ui/pages/home/v2/mobile/luxury_movie_review_theatre_dashboard_MASTER_LOCKED.avif?v=20260901-master-v3';
const state = { movies: [] };
const $ = (selector, root = document) => root.querySelector(selector);

function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function reviewHref(movie) {
  return `/?review=${encodeURIComponent(movie.s)}`;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(d);
}

function poster(movie, className) {
  const wrap = document.createElement('span');
  wrap.className = className;
  const img = document.createElement('img');
  img.src = movie.m;
  img.alt = `${movie.t} poster`;
  img.loading = 'lazy';
  img.decoding = 'async';
  wrap.append(img);
  return wrap;
}

function fitPovText(copy, pov) {
  if (!copy || !pov || !pov.textContent.trim()) return;

  if (!pov.dataset.maxFontPx) {
    const initial = Number.parseFloat(getComputedStyle(pov).fontSize) || 16;
    pov.dataset.maxFontPx = String(initial);
  }

  const maxPx = Number.parseFloat(pov.dataset.maxFontPx) || 16;
  const minPx = 7.5;

  // Keep the exact Content-page chalk treatment; only font size is allowed to vary.
  pov.style.display = 'block';
  pov.style.webkitLineClamp = 'unset';
  pov.style.webkitBoxOrient = 'initial';
  pov.style.overflow = 'visible';

  const setSize = px => {
    pov.style.fontSize = `${px.toFixed(2)}px`;
  };
  const fits = () => copy.scrollHeight <= copy.clientHeight + 1;

  setSize(maxPx);
  if (fits()) return;

  let low = minPx;
  let high = maxPx;
  let best = minPx;

  // Binary-search the largest readable size that keeps the complete POV visible.
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    setSize(mid);
    if (fits()) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  setSize(best);
}

function wirePovAutoFit(copy, pov) {
  const fit = () => requestAnimationFrame(() => fitPovText(copy, pov));
  fit();

  if (document.fonts?.ready) {
    document.fonts.ready.then(fit).catch(() => {});
  }

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(fit);
    observer.observe(copy);
  } else {
    window.addEventListener('resize', fit, { passive: true });
  }
}

function recentCard(movie) {
  const link = document.createElement('a');
  link.className = 'hm3-card';
  link.href = reviewHref(movie);
  link.setAttribute('aria-label', `Read ${movie.t} review`);

  const info = document.createElement('span');
  info.className = 'hm3-card-info';

  const title = document.createElement('strong');
  title.className = 'hm3-card-title';
  title.textContent = movie.t;

  const lang = document.createElement('span');
  lang.className = 'hm3-card-lang';
  lang.textContent = movie.l || '';

  const rating = document.createElement('span');
  rating.className = 'hm3-stars hm3-card-stars';
  rating.textContent = stars(movie.r);
  rating.setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);

  info.append(title, lang, rating);
  link.append(poster(movie, 'hm3-card-poster'), info);
  return link;
}

function previousCard(movie) {
  const link = document.createElement('a');
  link.className = 'hm3-prev-card';
  link.href = reviewHref(movie);
  link.setAttribute('aria-label', `Read ${movie.t} review`);

  const info = document.createElement('span');
  info.className = 'hm3-prev-info';

  const title = document.createElement('strong');
  title.className = 'hm3-prev-title';
  title.textContent = movie.t;

  const rating = document.createElement('span');
  rating.className = 'hm3-stars hm3-prev-stars';
  rating.textContent = stars(movie.r);
  rating.setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);

  info.append(title, rating);
  link.append(poster(movie, 'hm3-prev-poster'), info);
  return link;
}

function renderSearchResults(query = '') {
  const target = $('#searchResults');
  if (!target) return;
  target.replaceChildren();
  const q = query.trim().toLocaleLowerCase();

  state.movies
    .filter(movie => !q || movie.t.toLocaleLowerCase().includes(q) || String(movie.l || '').toLocaleLowerCase().includes(q))
    .slice(0, 30)
    .forEach(movie => {
      const a = document.createElement('a');
      a.className = 'search-result';
      a.href = reviewHref(movie);
      a.textContent = movie.t;

      const small = document.createElement('small');
      small.textContent = `${movie.l || ''}${movie.rd ? ` • ${formatDate(movie.rd)}` : ''}`;
      a.append(small);
      target.append(a);
    });
}

function wireGlobalNavigation(menuButton, searchButton) {
  const drawer = $('#menuDrawer');
  const backdrop = $('#drawerBackdrop');
  const dialog = $('#searchDialog');

  const openMenu = () => {
    drawer.dataset.open = 'true';
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
  };

  const closeMenu = () => {
    drawer.dataset.open = 'false';
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
  };

  const openSearch = () => {
    renderSearchResults('');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    requestAnimationFrame(() => $('#searchInput')?.focus());
  };

  const closeSearch = () => {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  };

  menuButton.addEventListener('click', openMenu);
  searchButton.addEventListener('click', openSearch);
  $('#menuClose')?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  $('#searchClose')?.addEventListener('click', closeSearch);
  $('#searchInput')?.addEventListener('input', event => renderSearchResults(event.target.value));

  $('.drawer-nav')?.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    closeMenu();
    if (action === 'search' || action === 'browse' || action === 'languages') openSearch();
  });
}

function makeHotspot(className, label, href = '#') {
  const el = href === '#' ? document.createElement('button') : document.createElement('a');
  el.className = `hm3-hotspot ${className}`;
  if (el.tagName === 'BUTTON') el.type = 'button';
  else el.href = href;
  el.setAttribute('aria-label', label);
  return el;
}

async function buildHome() {
  const now = state.movies[0];
  const recent = state.movies.slice(1, 8);
  const previous = state.movies.slice(8);
  if (!now) throw new Error('No reviews were found.');

  document.title = 'Movie Reviews By Poorna';
  document.body.classList.add('home-v3-mode');

  const page = document.createElement('div');
  page.className = 'hm3-page';

  const stage = document.createElement('div');
  stage.className = 'hm3-stage';

  const master = document.createElement('img');
  master.className = 'hm3-master';
  master.src = MASTER;
  master.alt = '';
  master.decoding = 'async';
  master.setAttribute('aria-hidden', 'true');
  stage.append(master);

  const menu = makeHotspot('hm3-menu', 'Open menu');
  const search = makeHotspot('hm3-search', 'Search reviews');
  stage.append(menu, search);

  const nowPoster = document.createElement('a');
  nowPoster.className = 'hm3-now-poster';
  nowPoster.href = reviewHref(now);
  nowPoster.append(poster(now, '').firstElementChild);
  nowPoster.setAttribute('aria-label', `Read ${now.t} review`);

  const copy = document.createElement('section');
  copy.className = 'hm3-now-copy';
  copy.setAttribute('aria-label', 'Now Reviewed movie details');

  const title = document.createElement('h1');
  title.className = 'hm3-now-title';
  title.textContent = now.t;

  const meta = document.createElement('div');
  meta.className = 'hm3-now-meta';
  const watched = document.createElement('span');
  watched.textContent = now.l || '—';
  meta.append(watched);
  if (now.rd) {
    const dot = document.createElement('span');
    dot.className = 'hm3-dot';
    dot.textContent = '•';
    meta.append(dot, document.createTextNode(formatDate(now.rd)));
  }

  const povLabel = document.createElement('div');
  povLabel.className = 'hm3-label';
  povLabel.textContent = 'My POV';

  const pov = document.createElement('p');
  pov.className = 'hm3-pov';
  pov.textContent = now.v || now.e || '';

  const ratingLabel = document.createElement('div');
  ratingLabel.className = 'hm3-label';
  ratingLabel.textContent = 'Rating';

  const ratingRow = document.createElement('div');
  ratingRow.className = 'hm3-rating-row';
  const rating = document.createElement('span');
  rating.className = 'hm3-stars hm3-now-stars';
  rating.textContent = stars(now.r);
  rating.setAttribute('aria-label', `${Math.round(Number(now.r) || 0)} out of 5 stars`);
  ratingRow.append(rating);

  copy.append(title, meta, povLabel, pov, ratingLabel, ratingRow);
  stage.append(nowPoster, copy);

  const readReview = makeHotspot('hm3-read-review', `Read ${now.t} review`, reviewHref(now));
  const recentViewAll = makeHotspot('hm3-recent-view-all', 'View all recent reviews');
  const prevViewAll = makeHotspot('hm3-prev-view-all', 'View all previously reviewed movies');
  stage.append(readReview, recentViewAll, prevViewAll);

  const recentViewport = document.createElement('div');
  recentViewport.className = 'hm3-recent-viewport';
  recentViewport.tabIndex = 0;
  recentViewport.setAttribute('aria-label', 'Recent Reviews. Swipe sideways to browse.');

  const recentTrack = document.createElement('div');
  recentTrack.className = 'hm3-recent-track';
  recent.forEach(movie => recentTrack.append(recentCard(movie)));
  recentViewport.append(recentTrack);

  const prevViewport = document.createElement('div');
  prevViewport.className = 'hm3-prev-viewport';
  prevViewport.tabIndex = 0;
  prevViewport.setAttribute('aria-label', 'Previously Reviewed. Swipe sideways to browse.');

  const prevTrack = document.createElement('div');
  prevTrack.className = 'hm3-prev-track';
  previous.forEach(movie => prevTrack.append(previousCard(movie)));
  prevViewport.append(prevTrack);

  stage.append(recentViewport, prevViewport);
  page.append(stage);
  $('#content').replaceChildren(page);
  $('#app').setAttribute('aria-busy', 'false');
  wireGlobalNavigation(menu, search);
  wirePovAutoFit(copy, pov);
}

async function init() {
  try {
    const response = await fetch('/data/catalog.json');
    if (!response.ok) throw new Error('Could not load review data.');
    state.movies = await response.json();
    await buildHome();
  } catch (error) {
    $('#content').innerHTML = `<section class="loading-card">${error.message || 'Unable to load the Home page.'}</section>`;
    $('#app').setAttribute('aria-busy', 'false');
  }
}

init();
