const DATA_BASE = '/data';
const PAGE_SIZE = 6;

const state = {
  movies: [],
  castCrew: null,
  query: '',
  language: '',
  year: '',
  rating: '',
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
  const minRating = Number(state.rating) || 0;
  const list = state.movies.filter(movie => {
    if (q && !searchableText(movie).includes(q)) return false;
    if (state.language && movie.l !== state.language) return false;
    if (state.year && yearOf(movie) !== state.year) return false;
    if (minRating && Number(movie.r || 0) < minRating) return false;
    return true;
  });

  return list.sort((a, b) => {
    if (state.sort === 'oldest') return String(a.rd || a.d || '').localeCompare(String(b.rd || b.d || '')) || a.t.localeCompare(b.t);
    if (state.sort === 'rating-desc') return Number(b.r || 0) - Number(a.r || 0) || String(b.rd || b.d || '').localeCompare(String(a.rd || a.d || ''));
    if (state.sort === 'title') return a.t.localeCompare(b.t);
    return String(b.rd || b.d || '').localeCompare(String(a.rd || a.d || '')) || b.i - a.i;
  });
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

  const likes = document.createElement('div');
  likes.className = 'review-likes';
  const likeValue = localLikes(movie.s);
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
  if (total <= 4) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 2) return [1, 2, 3, 4];
  if (current >= total - 1) return [total - 3, total - 2, total - 1, total];
  return [current - 1, current, current + 1, Math.min(total, current + 2)];
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
  previous.className = 'page-button';
  previous.type = 'button';
  previous.textContent = '‹';
  previous.ariaLabel = 'Previous page';
  previous.disabled = state.page === 1;
  previous.addEventListener('click', () => setPage(state.page - 1));
  nav.append(previous);

  for (const item of pageWindow(state.page, totalPages)) {
    const button = document.createElement('button');
    button.className = `page-button${item === state.page ? ' current' : ''}`;
    button.type = 'button';
    button.textContent = String(item);
    button.ariaLabel = `Page ${item}`;
    if (item === state.page) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => setPage(item));
    nav.append(button);
  }

  const ellipsis = document.createElement('span');
  ellipsis.className = 'page-ellipsis';
  ellipsis.textContent = totalPages > 4 ? '…' : '';
  ellipsis.setAttribute('aria-hidden', 'true');
  nav.append(ellipsis);

  const next = document.createElement('button');
  next.className = 'page-button';
  next.type = 'button';
  next.textContent = '›';
  next.ariaLabel = 'Next page';
  next.disabled = state.page === totalPages;
  next.addEventListener('click', () => setPage(state.page + 1));
  nav.append(next);
}

function setPage(page) {
  const total = Math.max(1, Math.ceil(filteredMovies().length / PAGE_SIZE));
  state.page = Math.max(1, Math.min(total, page));
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
    ? `Showing ${first}–${last} of ${movies.length} results`
    : 'Showing 0 results';

  $('#emptyState').hidden = movies.length !== 0;
  renderPagination(totalPages);
  stage.setAttribute('aria-busy', 'false');
}

function populateFilters() {
  const languages = [...new Set(state.movies.map(movie => movie.l).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const years = [...new Set(state.movies.map(yearOf).filter(Boolean))].sort((a, b) => b.localeCompare(a));

  const language = $('#languageFilter');
  for (const value of languages) language.add(new Option(value, value));

  const year = $('#yearFilter');
  for (const value of years) year.add(new Option(value, value));
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
  $('#ratingFilter').addEventListener('change', event => {
    state.rating = event.target.value;
    state.page = 1;
    render();
  });
  $('#sortFilter').addEventListener('change', event => {
    state.sort = event.target.value;
    state.page = 1;
    render();
  });
  $('#allReviews').addEventListener('click', () => {
    state.query = '';
    state.language = '';
    state.year = '';
    state.rating = '';
    state.sort = 'latest';
    state.page = 1;
    $('#cineSearch').value = '';
    $('#languageFilter').value = '';
    $('#yearFilter').value = '';
    $('#ratingFilter').value = '';
    $('#sortFilter').value = 'latest';
    render();
  });
  $('#filtersButton').addEventListener('click', () => {
    const expanded = $('#filtersButton').getAttribute('aria-expanded') === 'true';
    $('#filtersButton').setAttribute('aria-expanded', String(!expanded));
    $('#languageFilter').focus();
  });
}

async function init() {
  bindControls();
  try {
    const [moviesResponse, castResponse] = await Promise.all([
      fetch(`${DATA_BASE}/index.json`),
      fetch(`${DATA_BASE}/cast-crew.json`)
    ]);
    if (!moviesResponse.ok || !castResponse.ok) throw new Error('Could not load review data.');
    state.movies = await moviesResponse.json();
    state.castCrew = await castResponse.json();
    populateFilters();
    render();
  } catch (error) {
    $('#emptyState').hidden = false;
    $('#emptyState').textContent = error.message || 'Unable to load Cine Café.';
    stage.setAttribute('aria-busy', 'false');
  }
}

init();
