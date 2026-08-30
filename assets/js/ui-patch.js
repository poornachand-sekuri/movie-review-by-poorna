const searchDialog = document.querySelector('#searchDialog');
const searchClose = document.querySelector('#searchClose');

if (searchDialog && searchClose) {
  searchClose.addEventListener('click', () => {
    if (typeof searchDialog.close === 'function') searchDialog.close();
    else searchDialog.removeAttribute('open');
  });
}

const patchStyle = document.createElement('style');
patchStyle.textContent = `
  .movie-cast {
    display: grid;
    gap: 5px;
    white-space: normal !important;
  }
  .cast-line {
    display: grid;
    grid-template-columns: minmax(68px, auto) minmax(0, 1fr);
    gap: 7px;
    align-items: start;
  }
  .cast-label {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 20px;
    padding: 2px 6px;
    border: 1px solid rgba(216, 174, 99, .48);
    border-radius: 3px;
    background: rgba(216, 174, 99, .09);
    color: #d8ae63;
    font-size: .61rem;
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: .045em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .cast-value {
    min-width: 0;
    padding-top: 2px;
    color: #efe8d8;
    font-size: inherit;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;
document.head.append(patchStyle);

const patchState = {
  movies: null,
  castCrew: null,
  loading: null
};

function patchStars(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function patchIntersect(left = [], right = []) {
  const lookup = new Set(right.map(value => String(value).toLocaleLowerCase()));
  return left.filter(value => lookup.has(String(value).toLocaleLowerCase()));
}

function patchDateDistance(a, b) {
  const left = Date.parse(a || '1970-01-01');
  const right = Date.parse(b || '1970-01-01');
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(left - right) / 86400000;
}

function patchCastRecord(slug) {
  const raw = patchState.castCrew?.records?.[slug] || [];
  const fields = patchState.castCrew?.field_order || ['actors', 'actresses', 'directors', 'music_directors'];
  return Object.fromEntries(fields.map((field, index) => [field, raw[index] || []]));
}

async function loadPatchData() {
  if (patchState.movies && patchState.castCrew) return;
  if (patchState.loading) return patchState.loading;

  patchState.loading = Promise.all([
    fetch('/data/index.json'),
    fetch('/data/cast-crew.json')
  ]).then(async ([moviesResponse, castResponse]) => {
    if (!moviesResponse.ok || !castResponse.ok) throw new Error('Could not load patch data');
    patchState.movies = await moviesResponse.json();
    patchState.castCrew = await castResponse.json();
  }).finally(() => {
    patchState.loading = null;
  });

  return patchState.loading;
}

function currentPatchMovie() {
  if (!patchState.movies?.length) return null;
  const url = new URL(location.href);
  const querySlug = url.searchParams.get('review');
  if (querySlug) {
    const byQuery = patchState.movies.find(movie => movie.s === querySlug);
    if (byQuery) return byQuery;
  }

  const pathSlug = location.pathname.split('/').filter(Boolean).at(-1);
  if (pathSlug) {
    const byPath = patchState.movies.find(movie => movie.s === pathSlug);
    if (byPath) return byPath;
  }

  const title = document.querySelector('.movie-title')?.textContent?.trim();
  return patchState.movies.find(movie => movie.t === title) || patchState.movies[0];
}

function renderCastCrewLabels(movie) {
  const target = document.querySelector('.movie-cast');
  if (!target || !movie || target.dataset.labeled === movie.s) return;

  const record = patchCastRecord(movie.s);
  const groups = [
    ['Actor', record.actors],
    ['Actress', record.actresses],
    ['Director', record.directors],
    ['Music', record.music_directors]
  ].filter(([, values]) => Array.isArray(values) && values.length);

  target.replaceChildren();
  if (!groups.length) {
    target.textContent = '—';
    target.dataset.labeled = movie.s;
    return;
  }

  for (const [labelText, values] of groups) {
    const line = document.createElement('div');
    line.className = 'cast-line';

    const label = document.createElement('span');
    label.className = 'cast-label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'cast-value';
    value.textContent = values.join(', ');

    line.append(label, value);
    target.append(line);
  }

  target.dataset.labeled = movie.s;
}

function getCastDirectorRelated(current) {
  const currentRecord = patchCastRecord(current.s);

  return patchState.movies
    .filter(candidate => candidate.s !== current.s)
    .map(candidate => {
      const candidateRecord = patchCastRecord(candidate.s);
      const sharedActors = patchIntersect(currentRecord.actors, candidateRecord.actors);
      const sharedActresses = patchIntersect(currentRecord.actresses, candidateRecord.actresses);
      const sharedCast = [...sharedActors, ...sharedActresses];
      const sharedDirectors = patchIntersect(currentRecord.directors, candidateRecord.directors);

      let score = sharedCast.length * 100 + sharedDirectors.length * 65;
      if (sharedCast.length >= 2) score += 30;
      if (sharedCast.length && sharedDirectors.length) score += 20;

      const tier = sharedCast.length ? 1 : (sharedDirectors.length ? 2 : 99);
      const sharedPeople = [...new Set([...sharedCast, ...sharedDirectors])];

      return {
        movie: candidate,
        score,
        tier,
        sharedPeople,
        releaseDistance: patchDateDistance(current.rd, candidate.rd)
      };
    })
    .filter(item => item.tier <= 2 && item.sharedPeople.length)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.score !== b.score) return b.score - a.score;
      if (a.sharedPeople.length !== b.sharedPeople.length) return b.sharedPeople.length - a.sharedPeople.length;
      if (a.releaseDistance !== b.releaseDistance) return a.releaseDistance - b.releaseDistance;
      const dateCompare = String(b.movie.d || '').localeCompare(String(a.movie.d || ''));
      return dateCompare || a.movie.s.localeCompare(b.movie.s);
    })
    .slice(0, 4);
}

function renderCastDirectorRelated(movie) {
  const grid = document.querySelector('.related-grid');
  if (!grid || !movie || grid.dataset.matchMode === `cast-director:${movie.s}`) return;

  const related = getCastDirectorRelated(movie);
  grid.replaceChildren();

  for (const item of related) {
    const card = document.createElement('a');
    card.className = 'related-card';
    card.href = `/?review=${encodeURIComponent(item.movie.s)}`;
    card.title = `Related via ${item.sharedPeople.join(', ')}`;

    const posterZone = document.createElement('div');
    posterZone.className = 'related-poster-zone';

    const poster = document.createElement('img');
    poster.src = item.movie.m;
    poster.alt = `${item.movie.t} poster`;
    poster.loading = 'lazy';
    poster.decoding = 'async';
    posterZone.append(poster);

    const title = document.createElement('div');
    title.className = 'related-title';
    title.textContent = item.movie.t;

    const stars = document.createElement('div');
    stars.className = 'related-stars';
    stars.textContent = patchStars(item.movie.r);
    stars.setAttribute('aria-label', `${Math.round(Number(item.movie.r) || 0)} out of 5 stars`);

    card.append(posterZone, title, stars);
    grid.append(card);
  }

  if (!related.length) {
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = 'No cast/director related reviews found yet.';
    grid.append(empty);
  }

  grid.dataset.matchMode = `cast-director:${movie.s}`;
}

let patchScheduled = false;
async function applyContentPatches() {
  if (patchScheduled) return;
  patchScheduled = true;
  queueMicrotask(async () => {
    try {
      await loadPatchData();
      const movie = currentPatchMovie();
      if (!movie) return;
      renderCastCrewLabels(movie);
      renderCastDirectorRelated(movie);
    } catch (error) {
      console.warn('Fresh Take UI patch could not be applied:', error);
    } finally {
      patchScheduled = false;
    }
  });
}

const contentRoot = document.querySelector('#content');
if (contentRoot) {
  const observer = new MutationObserver(() => applyContentPatches());
  observer.observe(contentRoot, { childList: true, subtree: true });
}

applyContentPatches();
