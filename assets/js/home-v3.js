import { mountComments } from './comments.js';

const ASSET_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/home/v3/mobile';
const ASSET_VERSION = '20260901-lounge-final-3';
const state = { movies: [] };
const $ = (selector, root = document) => root.querySelector(selector);

const asset = file => `${ASSET_BASE}/${file}?v=${ASSET_VERSION}`;

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
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(d);
}

function imageShell(file, className, alt = '') {
  const img = document.createElement('img');
  img.className = className;
  img.src = asset(file);
  img.alt = alt;
  img.decoding = 'async';
  img.draggable = false;
  if (!alt) img.setAttribute('aria-hidden', 'true');
  return img;
}

function posterImage(movie) {
  const img = document.createElement('img');
  img.src = movie.m;
  img.alt = `${movie.t} poster`;
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

function makeHotspot(className, label, href = null) {
  const el = href ? document.createElement('a') : document.createElement('button');
  el.className = `hm3-hotspot ${className}`;
  if (href) el.href = href;
  else el.type = 'button';
  el.setAttribute('aria-label', label);
  return el;
}

function section(file, className, ariaLabel) {
  const wrap = document.createElement('section');
  wrap.className = `hm3-section-wrap ${className}`;
  if (ariaLabel) wrap.setAttribute('aria-label', ariaLabel);
  wrap.append(imageShell(file, 'hm3-section-art'));
  return wrap;
}

function fitPovText(container) {
  if (!container || !container.textContent.trim()) return;
  const maxPx = Number.parseFloat(getComputedStyle(container).fontSize) || 13;
  const minPx = 8;
  container.style.fontSize = `${maxPx}px`;
  if (container.scrollHeight <= container.clientHeight + 1) return;

  let low = minPx;
  let high = maxPx;
  let best = minPx;
  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    container.style.fontSize = `${mid}px`;
    if (container.scrollHeight <= container.clientHeight + 1) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  container.style.fontSize = `${best}px`;
}

function wirePovAutoFit(pov) {
  const fit = () => requestAnimationFrame(() => fitPovText(pov));
  fit();
  document.fonts?.ready?.then(fit).catch(() => {});
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(pov);
  else window.addEventListener('resize', fit, { passive: true });
}

function recentCard(movie) {
  const link = document.createElement('a');
  link.className = 'hm3-recent-card';
  link.href = reviewHref(movie);
  link.setAttribute('aria-label', `Read ${movie.t} review`);

  const poster = document.createElement('span');
  poster.className = 'hm3-recent-poster';
  poster.append(posterImage(movie));

  const info = document.createElement('span');
  info.className = 'hm3-recent-info';

  const title = document.createElement('strong');
  title.className = 'hm3-recent-title';
  title.textContent = movie.t;

  const rating = document.createElement('span');
  rating.className = 'hm3-stars hm3-recent-stars';
  rating.textContent = stars(movie.r);
  rating.setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);

  info.append(title, rating);
  link.append(poster, info);
  return link;
}

function previousCard(movie) {
  const link = document.createElement('a');
  link.className = 'hm3-prev-card';
  link.href = reviewHref(movie);
  link.setAttribute('aria-label', `Read ${movie.t} review`);

  const poster = document.createElement('span');
  poster.className = 'hm3-prev-poster';
  poster.append(posterImage(movie));

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
  link.append(poster, info);
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

  return { openSearch };
}

function buildCommentsOverlay(shareSection) {
  const overlay = document.createElement('div');
  overlay.className = 'hm3-comments-overlay';

  const list = document.createElement('div');
  list.className = 'comment-list hm3-comment-list';

  const form = document.createElement('form');
  form.className = 'comment-form hm3-comment-form';

  const identity = document.createElement('div');
  identity.className = 'hm3-comment-identity';

  const name = document.createElement('input');
  name.name = 'name';
  name.required = true;
  name.maxLength = 60;
  name.autocomplete = 'name';
  name.placeholder = 'Name';
  name.setAttribute('aria-label', 'Name');

  const email = document.createElement('input');
  email.name = 'email';
  email.type = 'email';
  email.required = true;
  email.maxLength = 120;
  email.autocomplete = 'email';
  email.placeholder = 'Email';
  email.setAttribute('aria-label', 'Email');

  identity.append(name, email);

  const comment = document.createElement('textarea');
  comment.name = 'comment';
  comment.required = true;
  comment.maxLength = 1200;
  comment.placeholder = 'Write your comment…';
  comment.setAttribute('aria-label', 'Comment');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'hm3-comment-submit';
  submit.textContent = 'Submit Comment';

  const status = document.createElement('p');
  status.className = 'comment-status hm3-comment-status';
  status.setAttribute('role', 'status');

  form.append(identity, comment, submit, status);
  overlay.append(list, form);
  shareSection.append(overlay);
  return overlay;
}

async function buildHome() {
  const now = state.movies[0];
  const recent = state.movies.slice(1, 5);
  const previous = state.movies.slice(5, 9);
  if (!now) throw new Error('No reviews were found.');

  document.title = 'Movie Reviews By Poorna';
  document.body.classList.add('home-v3-mode');

  const page = document.createElement('div');
  page.className = 'hm3-page';

  const stage = document.createElement('main');
  stage.className = 'hm3-stage';
  stage.setAttribute('aria-label', 'Movie Reviews By Poorna Lounge');
  stage.append(imageShell('01_background.avif', 'hm3-background'));

  const top = section('02_top_menu_section.avif', 'hm3-top-section', 'Movie Reviews By Poorna');
  const nowSection = section('03_now_reviewed_section.avif', 'hm3-now-section', 'Now Reviewed');
  const recentSection = section('04_recent_reviews_section.avif', 'hm3-recent-section', 'Recent Reviews');
  const previousSection = section('05_previously_reviewed.avif', 'hm3-previous-section', 'Previously Reviewed');
  const shareSection = section('06_share_your_opinion.avif', 'hm3-share-section', 'Share Your Opinion');
  const bottom = section('07_bottom_navigation.avif', 'hm3-bottom-section', 'Bottom navigation');

  stage.append(top, nowSection, recentSection, previousSection, shareSection, bottom);

  const menu = makeHotspot('hm3-menu', 'Open menu');
  const search = makeHotspot('hm3-search', 'Search reviews');
  top.append(menu, search);

  const nowPoster = document.createElement('a');
  nowPoster.className = 'hm3-now-poster';
  nowPoster.href = reviewHref(now);
  nowPoster.append(posterImage(now));
  nowPoster.setAttribute('aria-label', `Read ${now.t} review`);

  const nowCopy = document.createElement('section');
  nowCopy.className = 'hm3-now-copy';
  nowCopy.setAttribute('aria-label', 'Now Reviewed movie details');

  const title = document.createElement('h1');
  title.className = 'hm3-now-title';
  title.textContent = now.t;

  const meta = document.createElement('p');
  meta.className = 'hm3-now-meta';
  meta.textContent = [now.l, now.rd ? formatDate(now.rd) : ''].filter(Boolean).join(' • ');

  const povLabel = document.createElement('span');
  povLabel.className = 'hm3-now-label';
  povLabel.textContent = 'My POV';

  const pov = document.createElement('p');
  pov.className = 'hm3-pov';
  pov.textContent = now.v || now.e || '';

  nowCopy.append(title, meta, povLabel, pov);
  nowSection.append(nowPoster, nowCopy);

  const readReview = makeHotspot('hm3-read-review', `Read ${now.t} review`, reviewHref(now));
  nowSection.append(readReview);

  const recentGrid = document.createElement('div');
  recentGrid.className = 'hm3-recent-grid';
  recent.forEach(movie => recentGrid.append(recentCard(movie)));
  recentSection.append(recentGrid);
  recentSection.append(makeHotspot('hm3-recent-view-all', 'View all recent reviews'));

  const previousGrid = document.createElement('div');
  previousGrid.className = 'hm3-previous-grid';
  previous.forEach(movie => previousGrid.append(previousCard(movie)));
  previousSection.append(previousGrid);
  previousSection.append(makeHotspot('hm3-previous-view-all', 'View all previously reviewed movies'));

  const commentsOverlay = buildCommentsOverlay(shareSection);

  bottom.append(
    makeHotspot('hm3-lounge-nav', 'Lounge', '/'),
    makeHotspot('hm3-cafe-nav', 'Cini Cafe', '/cine-cafe/')
  );

  page.append(stage);
  $('#content').replaceChildren(page);
  $('#app').setAttribute('aria-busy', 'false');

  wireGlobalNavigation(menu, search);
  wirePovAutoFit(pov);
  await mountComments({ targetType: 'home', targetId: 'home', root: commentsOverlay });
}

async function loadMovies() {
  const sources = ['/data/catalog.json', '/data/index.json'];
  let lastError = null;

  for (const source of sources) {
    try {
      const response = await fetch(source, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Could not load ${source}`);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json')) throw new Error(`${source} did not return JSON`);
      const payload = await response.json();
      const movies = Array.isArray(payload) ? payload : payload?.reviews;
      if (Array.isArray(movies) && movies.length) return movies;
      throw new Error(`${source} contained no reviews`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Could not load review data.');
}

async function init() {
  try {
    state.movies = await loadMovies();
    await buildHome();
  } catch (error) {
    $('#content').innerHTML = `<section class="loading-card">${error.message || 'Unable to load the Home page.'}</section>`;
    $('#app').setAttribute('aria-busy', 'false');
  }
}

init();
