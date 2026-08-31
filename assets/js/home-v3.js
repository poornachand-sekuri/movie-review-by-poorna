import { CONFIG } from './config.js';

const MASTER = 'https://assets.moviereviewbypoorna.com/ui/pages/home/v2/mobile/luxury_movie_review_theatre_dashboard_MASTER_LOCKED.avif?v=20260831-master-v3';
const state = { movies: [], castCrew: null };
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
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function castSummary(slug) {
  const raw = state.castCrew?.records?.[slug] || [];
  const order = state.castCrew?.field_order || ['actors', 'actresses', 'directors', 'music_directors'];
  const record = Object.fromEntries(order.map((key, i) => [key, raw[i] || []]));
  const people = [...(record.actors || []), ...(record.actresses || [])].slice(0, 4);
  const director = (record.directors || [])[0];
  const chunks = [];
  if (people.length) chunks.push(people.join(', '));
  if (director) chunks.push(`Director: ${director}`);
  return chunks.join(' • ') || '—';
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
  const openMenu = () => { drawer.dataset.open = 'true'; drawer.setAttribute('aria-hidden', 'false'); backdrop.hidden = false; };
  const closeMenu = () => { drawer.dataset.open = 'false'; drawer.setAttribute('aria-hidden', 'true'); backdrop.hidden = true; };
  const openSearch = () => {
    renderSearchResults('');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    requestAnimationFrame(() => $('#searchInput')?.focus());
  };
  const closeSearch = () => { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); };

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
  if (el.tagName === 'BUTTON') el.type = 'button'; else el.href = href;
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
  const dot = () => { const s = document.createElement('span'); s.className = 'hm3-dot'; s.textContent = '•'; return s; };
  meta.append(watched);
  if (now.rd) { meta.append(dot(), document.createTextNode(formatDate(now.rd))); }
  const castLabel = document.createElement('div');
  castLabel.className = 'hm3-label';
  castLabel.textContent = 'Cast & Crew';
  const cast = document.createElement('p');
  cast.className = 'hm3-cast';
  cast.textContent = castSummary(now.s);
  const povLabel = document.createElement('div');
  povLabel.className = 'hm3-label';
  povLabel.textContent = 'My POV';
  const pov = document.createElement('p');
  pov.className = 'hm3-pov';
  pov.textContent = now.v || now.e || '';
  const ratingLabel = document.createElement('div');
  ratingLabel.className = 'hm3-label';
  ratingLabel.textContent = 'My Review';
  const ratingRow = document.createElement('div');
  ratingRow.className = 'hm3-rating-row';
  const rating = document.createElement('span');
  rating.className = 'hm3-stars hm3-now-stars';
  rating.textContent = stars(now.r);
  rating.setAttribute('aria-label', `${Math.round(Number(now.r) || 0)} out of 5 stars`);
  ratingRow.append(rating);
  copy.append(title, meta, castLabel, cast, povLabel, pov, ratingLabel, ratingRow);
  stage.append(nowPoster, copy);

  const readReview = makeHotspot('hm3-read-review', `Read ${now.t} review`, reviewHref(now));
  const recentViewAll = makeHotspot('hm3-recent-view-all', 'View all recent reviews');
  const prevViewAll = makeHotspot('hm3-prev-view-all', 'View all previously reviewed movies');
  recentViewAll.addEventListener('click', () => {});
  prevViewAll.addEventListener('click', () => {});
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
}

async function init() {
  try {
    const [moviesResponse, castResponse] = await Promise.all([
      fetch(`${CONFIG.dataBase}/index.json`),
      fetch(`${CONFIG.dataBase}/cast-crew.json`)
    ]);
    if (!moviesResponse.ok || !castResponse.ok) throw new Error('Could not load review data.');
    state.movies = await moviesResponse.json();
    state.castCrew = await castResponse.json();
    await buildHome();
  } catch (error) {
    $('#content').innerHTML = `<section class="loading-card">${error.message || 'Unable to load the Home page.'}</section>`;
    $('#app').setAttribute('aria-busy', 'false');
  }
}

init();
