import './analytics.js';

const DATA_BASE = '/data';
const PAGE_SIZE = 6;

const state = {
  movies: [],
  castCrew: null,
  query: '',
  language: '',
  year: '',
  sort: 'latest',
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
  const list = state.movies.filter(movie => {
    if (q && !searchableText(movie).includes(q)) return false;
    if (state.language && String(movie.l || '') !== state.language) return false;
    if (state.year && yearOf(movie) !== state.year) return false;
    return true;
  });

  const latest = (a, b) =>
    String(b.rd || b.d || '').localeCompare(String(a.rd || a.d || '')) ||
    Number(b.i || 0) - Number(a.i || 0);
  const oldest = (a, b) => -latest(a, b);
  const titleAZ = (a, b) => String(a.t || '').localeCompare(String(b.t || ''), undefined, { sensitivity: 'base' });
  const titleZA = (a, b) => -titleAZ(a, b);

  if (state.sort === 'oldest') list.sort(oldest);
  else if (state.sort === 'title-az') list.sort(titleAZ);
  else if (state.sort === 'title-za') list.sort(titleZA);
  else list.sort(latest);

  return list;
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
  const lineHeightRatio = 1.05;

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
  poster.loading = index < 3 ? 'eager' : 'lazy';
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
  likes.setAttribute('aria-label', `${likeValue} likes`);
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

function syncFilterLabels() {
  $('#languageLabel').textContent = state.language || 'Language';
  $('#yearLabel').textContent = state.year || 'Year';
  const sortNames = {
    latest: 'Latest',
    oldest: 'Oldest',
    'title-az': 'Title A–Z',
    'title-za': 'Title Z–A'
  };
  $('#sortLabel').textContent = sortNames[state.sort] || 'Latest';
}

function populateFilters() {
  const languages = [...new Set(state.movies.map(movie => String(movie.l || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const years = [...new Set(state.movies.map(yearOf).filter(Boolean))].sort((a, b) => Number(b) - Number(a));

  const languageSelect = $('#languageFilter');
  const yearSelect = $('#yearFilter');
  languageSelect.replaceChildren(new Option('All Languages', ''), ...languages.map(value => new Option(value, value)));
  yearSelect.replaceChildren(new Option('All Years', ''), ...years.map(value => new Option(value, value)));
}

function render() {
  const movies = filteredMovies();
  const totalPages = Math.max(1, Math.ceil(movies.length / PAGE_SIZE));
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * PAGE_SIZE;
  const visible = movies.slice(start, start + PAGE_SIZE);
  $('#resultsLayer').replaceChildren(...visible.map(makeCard));

  const first = movies.length ? start + 1 : 0;
  const last = Math.min(start + PAGE_SIZE, movies.length);
  $('#servingRange').textContent = movies.length ? `${first}–${last}` : '0';
  $('#servingTotal').textContent = String(movies.length);

  $('#emptyState').hidden = movies.length !== 0;
  renderPagination(totalPages);
  syncFilterLabels();
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

  $('#languageFilter').addEventListener('change', event => {
    state.language = event.target.value;
    state.page = 1;
    render();
  });

  $('#yearFilter').addEventListener('change', event => {
    state.year = event.target.value;
    state.page = 1;
    render();
  });

  $('#sortFilter').addEventListener('change', event => {
    state.sort = event.target.value;
    state.page = 1;
    render();
  });

  $('#clearFilters').addEventListener('click', () => {
    state.query = '';
    state.language = '';
    state.year = '';
    state.sort = 'latest';
    state.page = 1;
    $('#cineSearch').value = '';
    $('#languageFilter').value = '';
    $('#yearFilter').value = '';
    $('#sortFilter').value = 'latest';
    render();
  });

  window.addEventListener('resize', () => requestAnimationFrame(fitReviewTitles));
}

async function loadMovies() {
  const sources = ['/data/catalog.json', '/data/index.json'];
  let lastError = null;
  for (const source of sources) {
    try {
      const response = await fetch(source, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`Could not load ${source}`);
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
  bindControls();
  try {
    const [movies, castResponse] = await Promise.all([
      loadMovies(),
      fetch(`${DATA_BASE}/cast-crew.json`)
    ]);
    if (!castResponse.ok) throw new Error('Could not load cast and crew data.');
    state.movies = movies;
    state.castCrew = await castResponse.json();
    populateFilters();
    render();
  } catch (error) {
    $('#emptyState').hidden = false;
    $('#emptyState').textContent = error.message || 'Unable to load Cini Cafe.';
    stage.setAttribute('aria-busy', 'false');
  }
}

init();
