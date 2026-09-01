import './analytics.js';

const DATA_BASE = '/data';
const PAGE_SIZE = 6;

const state = {
  movies: [],
  castCrew: null,
  query: '',
  page: 1
};

const $ = selector => document.querySelector(selector);
const stage = $('#cineCafeStage');

function yearOf(movie) {
  const value = movie.rd || movie.d || '';
  const match = String(value).match(/^(\d{4})/);
  return match ? match[1] : '';
}

function normalizeCastRecord(slug) {
  const raw = state.castCrew?.records?.[slug] || [];
  const fields = state.castCrew?.field_order || ['actors', 'actresses', 'directors', 'music_directors'];
  return Object.fromEntries(fields.map((field, index) => [field, raw[index] || []]));
}

function searchableText(movie) {
  const cast = normalizeCastRecord(movie.s);
  return [
    movie.t,
    movie.l,
    yearOf(movie),
    ...(cast.actors || []),
    ...(cast.actresses || []),
    ...(cast.directors || []),
    ...(cast.music_directors || [])
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

function starString(rating) {
  const rounded = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(rounded)}${'☆'.repeat(5 - rounded)}`;
}

function localLikes(slug) {
  try {
    const data = JSON.parse(localStorage.getItem(`mrp-reactions:${slug}`) || '{}');
    return Math.max(0, Number(data.like) || 0);
  } catch {
    return 0;
  }
}

function filteredMovies() {
  const q = state.query.trim().toLocaleLowerCase();
  return state.movies
    .filter(movie => !q || searchableText(movie).includes(q))
    .sort((a, b) =>
      String(b.rd || b.d || '').localeCompare(String(a.rd || a.d || '')) ||
      Number(b.i || 0) - Number(a.i || 0)
    );
}

function fitOneTitle(title) {
  const text = (title.textContent || '').trim();
  if (!text || !title.clientWidth) return;

  title.title = text;
  title.style.fontSize = '';
  title.style.lineHeight = '';
  title.style.maxHeight = '';

  const computed = getComputedStyle(title);
  const startSize = Number.parseFloat(computed.fontSize) || 16;
  const minSize = 9.5;
  const lineHeightRatio = 1.04;

  const measure = title.cloneNode(true);
  Object.assign(measure.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-9999px',
    top: '0',
    width: `${title.clientWidth}px`,
    height: 'auto',
    maxHeight: 'none',
    overflow: 'visible',
    display: 'block',
    webkitLineClamp: 'unset',
    webkitBoxOrient: 'unset',
    whiteSpace: 'normal',
    lineHeight: String(lineHeightRatio)
  });
  document.body.append(measure);

  let size = startSize;
  while (size > minSize) {
    measure.style.fontSize = `${size}px`;
    const maxThreeLines = size * lineHeightRatio * 3 + 2;
    if (measure.scrollHeight <= maxThreeLines) break;
    size -= 0.5;
  }
  measure.remove();

  title.style.fontSize = `${Math.max(minSize, size)}px`;
  title.style.lineHeight = String(lineHeightRatio);
  title.style.maxHeight = `${Math.max(minSize, size) * lineHeightRatio * 3.05}px`;
}

function fitReviewTitles() {
  document.querySelectorAll('.review-title').forEach(fitOneTitle);
}

function makeCard(movie, index) {
  const article = document.createElement('article');
  article.className = 'review-card';

  const link = document.createElement('a');
  link.className = 'review-link';
  link.href = `/?review=${encodeURIComponent(movie.s)}`;
  link.setAttribute('aria-label', `Open review: ${movie.t}`);

  const posterZone = document.createElement('div');
  posterZone.className = 'poster-zone';
  const poster = document.createElement('img');
  poster.src = movie.m;
  poster.alt = `${movie.t} poster`;
  poster.loading = index < 2 ? 'eager' : 'lazy';
  poster.decoding = 'async';
  posterZone.append(poster);

  const info = document.createElement('div');
  info.className = 'review-info';

  const title = document.createElement('h2');
  title.className = 'review-title';
  title.textContent = movie.t;

  const meta = document.createElement('p');
  meta.className = 'review-meta';
  meta.textContent = [movie.l, yearOf(movie)].filter(Boolean).join(' • ');

  const stars = document.createElement('div');
  stars.className = 'review-stars';
  stars.textContent = starString(movie.r);
  stars.setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);

  const likeValue = localLikes(movie.s);
  const likes = document.createElement('div');
  likes.className = 'review-likes';
  likes.hidden = likeValue <= 0;
  likes.setAttribute('aria-label', `${likeValue} likes`);
  likes.textContent = '♥';
  const likeCount = document.createElement('span');
  likeCount.textContent = String(likeValue);
  likes.append(likeCount);

  info.append(title, meta, stars, likes);
  link.append(posterZone, info);
  article.append(link);
  return article;
}

function pageWindow(current, total) {
  if (total <= 4) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 2) return [1, 2, 3, 4];
  if (current >= total - 1) return [total - 3, total - 2, total - 1, total];
  return [current - 1, current, current + 1, current + 2];
}

function renderPagination(totalPages) {
  const nav = $('#pagination');
  nav.replaceChildren();

  if (totalPages <= 1) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;

  const previous = document.createElement('button');
  previous.className = 'page-button page-arrow';
  previous.type = 'button';
  previous.textContent = '‹';
  previous.setAttribute('aria-label', 'Previous page');
  previous.disabled = state.page === 1;
  previous.addEventListener('click', () => setPage(state.page - 1));
  nav.append(previous);

  const pages = pageWindow(state.page, totalPages);
  for (let slot = 0; slot < 4; slot += 1) {
    const page = pages[slot];
    if (!page) {
      const empty = document.createElement('span');
      empty.className = 'page-slot-empty';
      empty.setAttribute('aria-hidden', 'true');
      nav.append(empty);
      continue;
    }

    const button = document.createElement('button');
    button.className = `page-button${page === state.page ? ' current' : ''}`;
    button.type = 'button';
    button.textContent = String(page);
    button.setAttribute('aria-label', `Page ${page}`);
    if (page === state.page) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => setPage(page));
    nav.append(button);
  }

  const next = document.createElement('button');
  next.className = 'page-button page-arrow';
  next.type = 'button';
  next.textContent = '›';
  next.setAttribute('aria-label', 'Next page');
  next.disabled = state.page === totalPages;
  next.addEventListener('click', () => setPage(state.page + 1));
  nav.append(next);
}

function setPage(page) {
  const totalPages = Math.max(1, Math.ceil(filteredMovies().length / PAGE_SIZE));
  state.page = Math.max(1, Math.min(totalPages, page));
  render();
  stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function render() {
  const movies = filteredMovies();
  const totalPages = Math.max(1, Math.ceil(movies.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * PAGE_SIZE;
  const visible = movies.slice(start, start + PAGE_SIZE);
  const layer = $('#resultsLayer');
  layer.replaceChildren(...visible.map(makeCard));

  const first = movies.length ? start + 1 : 0;
  const last = Math.min(start + PAGE_SIZE, movies.length);
  $('#resultCount').textContent = movies.length
    ? `Serving ${first}–${last} of ${movies.length} reviews`
    : 'Serving 0 reviews';

  $('#emptyState').hidden = movies.length !== 0;
  renderPagination(totalPages);
  stage.setAttribute('aria-busy', 'false');
  requestAnimationFrame(fitReviewTitles);
}

function bindControls() {
  $('#headerSearch').addEventListener('click', () => $('#cineSearch').focus());
  $('#searchForm').addEventListener('submit', event => event.preventDefault());
  $('#cineSearch').addEventListener('input', event => {
    state.query = event.target.value;
    state.page = 1;
    render();
  });
  window.addEventListener('resize', () => requestAnimationFrame(fitReviewTitles));
}

async function init() {
  bindControls();
  try {
    const [moviesResponse, castResponse] = await Promise.all([
      fetch('/data/catalog.json'),
      fetch(`${DATA_BASE}/cast-crew.json`)
    ]);
    if (!moviesResponse.ok || !castResponse.ok) throw new Error('Could not load review data.');
    state.movies = await moviesResponse.json();
    state.castCrew = await castResponse.json();
    render();
  } catch (error) {
    $('#emptyState').hidden = false;
    $('#emptyState').textContent = error.message || 'Unable to load Cine Café.';
    stage.setAttribute('aria-busy', 'false');
  }
}

init();