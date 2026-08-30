import { CONFIG, uiAsset } from './config.js';

const state = {
  movies: [],
  castCrew: null,
  rules: null,
  movieBySlug: new Map(),
  activeMovie: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function setAsset(img, name) {
  img.src = uiAsset(name);
  img.decoding = 'async';
}

function starString(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function normalizeCastRecord(slug) {
  const raw = state.castCrew?.records?.[slug] || [];
  const fields = state.castCrew?.field_order || ['actors', 'actresses', 'directors', 'music_directors'];
  return Object.fromEntries(fields.map((field, index) => [field, raw[index] || []]));
}

function castGroups(slug) {
  const record = normalizeCastRecord(slug);
  return [
    ['Actor', record.actors],
    ['Actress', record.actresses],
    ['Director', record.directors],
    ['Music', record.music_directors]
  ].filter(([, values]) => values?.length);
}

function renderCastCrew(container, slug) {
  container.replaceChildren();
  const groups = castGroups(slug);
  if (!groups.length) {
    container.textContent = '—';
    return;
  }

  for (const [labelText, values] of groups) {
    const row = document.createElement('div');
    row.className = 'cast-crew-row';

    const label = document.createElement('span');
    label.className = 'cast-role-label';
    label.textContent = labelText;

    const value = document.createElement('span');
    value.className = 'cast-role-value';
    value.textContent = values.join(', ');

    row.append(label, value);
    container.append(row);
  }
}

function intersect(a = [], b = []) {
  const right = new Set(b.map(value => value.toLocaleLowerCase()));
  return a.filter(value => right.has(value.toLocaleLowerCase()));
}

function dateDistanceDays(a, b) {
  const ta = Date.parse(a || '1970-01-01');
  const tb = Date.parse(b || '1970-01-01');
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(ta - tb) / 86400000;
}

function scoreRelated(current, candidate) {
  const currentCast = normalizeCastRecord(current.s);
  const candidateCast = normalizeCastRecord(candidate.s);

  const sharedActors = intersect(currentCast.actors, candidateCast.actors);
  const sharedActresses = intersect(currentCast.actresses, candidateCast.actresses);
  const sharedCast = [...sharedActors, ...sharedActresses];
  const sharedDirectors = intersect(currentCast.directors, candidateCast.directors);
  const sharedMusic = intersect(currentCast.music_directors, candidateCast.music_directors);

  const tierRules = Object.fromEntries((state.rules?.tiers || []).map(tier => [tier.name, tier]));
  const castWeight = tierRules.shared_cast?.weight_per_shared_person ?? 100;
  const directorWeight = tierRules.shared_director?.weight_per_shared_person ?? 65;
  const musicWeight = tierRules.shared_music_director?.weight_per_shared_person ?? 25;
  const bonuses = state.rules?.bonuses || {};

  let tier = 99;
  let score = 0;
  let sharedPeople = [];

  if (sharedCast.length) {
    tier = 1;
    score = sharedCast.length * castWeight;
    score += sharedDirectors.length * directorWeight;
    if (sharedCast.length >= 2) score += bonuses.two_or_more_shared_cast_members || 0;
    if (sharedDirectors.length) score += bonuses.shared_cast_and_director || 0;
    sharedPeople = [...new Set([...sharedCast, ...sharedDirectors])];
  } else if (sharedDirectors.length) {
    tier = 2;
    score = sharedDirectors.length * directorWeight;
    sharedPeople = [...new Set(sharedDirectors)];
  } else if (sharedMusic.length) {
    // Music directors are strictly fallback-only. They never boost a cast/director match.
    tier = 3;
    score = sharedMusic.length * musicWeight;
    sharedPeople = [...new Set(sharedMusic)];
  }

  return {
    movie: candidate,
    score,
    tier,
    sharedPeople,
    releaseDistance: dateDistanceDays(current.rd, candidate.rd)
  };
}

function getRelated(current) {
  const max = state.rules?.max_results || 4;
  const scored = state.movies
    .filter(movie => movie.s !== current.s)
    .map(movie => scoreRelated(current, movie))
    .filter(item => item.sharedPeople.length)
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.score !== b.score) return b.score - a.score;
      if (a.sharedPeople.length !== b.sharedPeople.length) return b.sharedPeople.length - a.sharedPeople.length;
      if (a.releaseDistance !== b.releaseDistance) return a.releaseDistance - b.releaseDistance;
      const dateCompare = String(b.movie.d || '').localeCompare(String(a.movie.d || ''));
      return dateCompare || a.movie.s.localeCompare(b.movie.s);
    });

  // Fill all Actor/Actress and Director matches first.
  const primary = scored.filter(item => item.tier <= 2).slice(0, max);
  if (primary.length >= max) return primary;

  // Only then use Music Director matches to fill any remaining slots.
  const selected = [...primary];
  const used = new Set(primary.map(item => item.movie.s));
  for (const item of scored.filter(entry => entry.tier === 3)) {
    if (!used.has(item.movie.s)) {
      selected.push(item);
      used.add(item.movie.s);
    }
    if (selected.length >= max) break;
  }
  return selected;
}

function resolveSlug() {
  const url = new URL(location.href);
  const fromQuery = url.searchParams.get('review');
  if (fromQuery && state.movieBySlug.has(fromQuery)) return fromQuery;

  const pathSlug = location.pathname.split('/').filter(Boolean).at(-1);
  if (pathSlug && state.movieBySlug.has(pathSlug)) return pathSlug;

  return state.movies[0]?.s || null;
}

function setupArtwork(root) {
  setAsset($('#brandArtwork'), 'header');
  setAsset($('.clapboard-top', root), 'clapTop');
  $('.clapboard-bg', root).style.backgroundImage = `url("${uiAsset('clapBody')}")`;
  $('.reaction-bg', root).style.backgroundImage = `url("${uiAsset('likeFrame')}")`;
  setAsset($('.poster-frame-art', root), 'posterFrame');
  setAsset($('.theater-top', root), 'theaterTop');
  $('.theater-middle', root).style.backgroundImage = `url("${uiAsset('theaterMiddle')}")`;
  setAsset($('.theater-bottom', root), 'theaterBottom');
  setAsset($('.related-header', root), 'relatedHeader');
  $('.related-reel', root).style.backgroundImage = `url("${uiAsset('relatedReel')}")`;
  setAsset($('.comments-header', root), 'commentsHeader');
  $('.comments-bg', root).style.backgroundImage = `url("${uiAsset('commentsShell')}")`;
  document.documentElement.style.setProperty('--related-comments-gap', `${CONFIG.relatedToCommentsGapPx}px`);
}

function renderRelated(root, movie) {
  const grid = $('.related-grid', root);
  const reel = $('.related-reel', root);
  grid.replaceChildren();
  const related = getRelated(movie);

  // The source artwork contains five windows, but this page displays at most four reviews.
  // Crop the unused artwork windows rather than showing an empty framed reel.
  reel.style.setProperty('--related-count', String(Math.max(1, Math.min(4, related.length || 1))));

  for (const item of related) {
    const card = document.createElement('a');
    card.className = 'related-card';
    card.href = `/?review=${encodeURIComponent(item.movie.s)}`;
    card.title = item.sharedPeople.length ? `Related via ${item.sharedPeople.join(', ')}` : item.movie.t;

    const posterZone = document.createElement('div');
    posterZone.className = 'related-poster-zone';
    const poster = document.createElement('img');
    poster.src = item.movie.m;
    poster.alt = `${item.movie.t} poster`;
    poster.loading = 'lazy';
    posterZone.append(poster);

    const title = document.createElement('div');
    title.className = 'related-title';
    title.textContent = item.movie.t;

    const stars = document.createElement('div');
    stars.className = 'related-stars';
    stars.textContent = starString(item.movie.r);
    stars.setAttribute('aria-label', `${Math.round(Number(item.movie.r) || 0)} out of 5 stars`);

    card.append(posterZone, title, stars);
    grid.append(card);
  }

  if (!related.length) {
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = 'No related reviews found yet.';
    grid.append(empty);
  }
}

function reactionStorageKey(slug) {
  return `mrp-reactions:${slug}`;
}

function getLocalReactions(slug) {
  try {
    const parsed = JSON.parse(localStorage.getItem(reactionStorageKey(slug)) || '{}');
    return { like: Number(parsed.like) || 0, dislike: Number(parsed.dislike) || 0, myVote: parsed.myVote || null };
  } catch {
    return { like: 0, dislike: 0, myVote: null };
  }
}

function setLocalReactions(slug, value) {
  localStorage.setItem(reactionStorageKey(slug), JSON.stringify(value));
}

async function loadReactions(slug) {
  if (!CONFIG.apiBase) return getLocalReactions(slug);
  try {
    const response = await fetch(`${CONFIG.apiBase}/reactions?slug=${encodeURIComponent(slug)}`);
    if (!response.ok) throw new Error('reaction request failed');
    return await response.json();
  } catch {
    return getLocalReactions(slug);
  }
}

async function submitReaction(slug, vote) {
  if (CONFIG.apiBase) {
    const response = await fetch(`${CONFIG.apiBase}/reactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, vote })
    });
    if (!response.ok) throw new Error('Could not save reaction');
    return response.json();
  }

  const current = getLocalReactions(slug);
  if (current.myVote === vote) return current;
  if (current.myVote === 'like') current.like = Math.max(0, current.like - 1);
  if (current.myVote === 'dislike') current.dislike = Math.max(0, current.dislike - 1);
  current[vote] += 1;
  current.myVote = vote;
  setLocalReactions(slug, current);
  return current;
}

function paintReactions(root, values) {
  $('.like-count', root).textContent = values.like ?? 0;
  $('.dislike-count', root).textContent = values.dislike ?? 0;
  for (const button of $$('.reaction-button', root)) {
    button.setAttribute('aria-pressed', String(button.dataset.vote === values.myVote));
  }
}

async function setupReactions(root, movie) {
  paintReactions(root, await loadReactions(movie.s));
  for (const button of $$('.reaction-button', root)) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        paintReactions(root, await submitReaction(movie.s, button.dataset.vote));
      } finally {
        button.disabled = false;
      }
    });
  }
}

async function loadComments(slug) {
  if (!CONFIG.apiBase) return [];
  try {
    const response = await fetch(`${CONFIG.apiBase}/comments?slug=${encodeURIComponent(slug)}`);
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload) ? payload : payload.comments || [];
  } catch {
    return [];
  }
}

function commentCard(comment) {
  const card = document.createElement('article');
  card.className = 'comment-card';
  const name = document.createElement('strong');
  name.textContent = comment.name || 'Movie Lover';
  const body = document.createElement('p');
  body.textContent = comment.comment || '';
  const time = document.createElement('time');
  time.textContent = comment.created_at ? formatDate(comment.created_at.slice(0, 10)) : '';
  card.append(name, body, time);
  return card;
}

async function setupComments(root, movie) {
  const list = $('.comment-list', root);
  const comments = await loadComments(movie.s);
  list.replaceChildren();
  if (comments.length) comments.forEach(comment => list.append(commentCard(comment)));
  else {
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = CONFIG.apiBase
      ? 'No approved comments yet. Be the first to share your opinion.'
      : 'Comments backend is not connected on this preview branch yet.';
    list.append(empty);
  }

  const form = $('.comment-form', root);
  const status = $('.comment-status', root);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      slug: movie.s,
      name: String(data.get('name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      comment: String(data.get('comment') || '').trim()
    };
    if (!payload.name || !payload.email || !payload.comment) return;

    const submit = $('button[type="submit"]', form);
    submit.disabled = true;
    status.textContent = '';
    try {
      if (!CONFIG.apiBase) {
        status.textContent = 'Preview mode: the form is ready, but a moderation API must be connected before public launch.';
        return;
      }
      const response = await fetch(`${CONFIG.apiBase}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Could not submit comment');
      form.reset();
      status.textContent = 'Thank you. Your comment is pending admin approval.';
    } catch (error) {
      status.textContent = error.message || 'Could not submit comment.';
    } finally {
      submit.disabled = false;
    }
  });
}

function renderMovie(movie) {
  state.activeMovie = movie;
  document.title = `${movie.t} — Movie Reviews By Poorna`;
  const template = $('#reviewTemplate');
  const fragment = template.content.cloneNode(true);
  const root = $('.review-page', fragment);
  setupArtwork(root);

  $('.movie-title', root).textContent = movie.t;
  $('.movie-language', root).textContent = movie.l || '—';
  $('.movie-release', root).textContent = formatDate(movie.rd);
  renderCastCrew($('.movie-cast', root), movie.s);
  $('.movie-rating', root).textContent = starString(movie.r);
  $('.movie-rating', root).setAttribute('aria-label', `${Math.round(Number(movie.r) || 0)} out of 5 stars`);
  $('.movie-pov', root).textContent = movie.v || movie.e || '';

  const poster = $('.movie-poster', root);
  poster.src = movie.m;
  poster.alt = `${movie.t} poster`;

  // Review body is authored content from the site's own preserved dataset.
  $('.review-body', root).innerHTML = movie.body || `<p>${movie.e || ''}</p>`;

  renderRelated(root, movie);

  const content = $('#content');
  content.replaceChildren(fragment);
  setupReactions(content, movie);
  setupComments(content, movie);
  $('#app').setAttribute('aria-busy', 'false');
}

function renderSearchResults(query = '') {
  const container = $('#searchResults');
  container.replaceChildren();
  const normalized = query.trim().toLocaleLowerCase();
  const matches = state.movies
    .filter(movie => !normalized || movie.t.toLocaleLowerCase().includes(normalized))
    .slice(0, 30);

  for (const movie of matches) {
    const link = document.createElement('a');
    link.className = 'search-result';
    link.href = `/?review=${encodeURIComponent(movie.s)}`;
    link.textContent = movie.t;
    const small = document.createElement('small');
    small.textContent = `${movie.l || 'Language unknown'} • ${formatDate(movie.rd)}`;
    link.append(small);
    container.append(link);
  }
}

function openSearch() {
  const dialog = $('#searchDialog');
  renderSearchResults('');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  requestAnimationFrame(() => $('#searchInput').focus());
}

function setupNavigation() {
  const drawer = $('#menuDrawer');
  const backdrop = $('#drawerBackdrop');
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

  $('#menuButton').addEventListener('click', openMenu);
  $('#menuClose').addEventListener('click', closeMenu);
  backdrop.addEventListener('click', closeMenu);
  $('#searchButton').addEventListener('click', openSearch);

  $('.drawer-nav').addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    closeMenu();
    if (action === 'search' || action === 'browse') openSearch();
    if (action === 'languages') {
      openSearch();
      $('#searchInput').placeholder = 'Search movie title or language…';
    }
  });

  $('#searchInput').addEventListener('input', event => renderSearchResults(event.target.value));
}

async function loadData() {
  const [moviesResponse, castResponse, rulesResponse] = await Promise.all([
    fetch(`${CONFIG.dataBase}/index.json`),
    fetch(`${CONFIG.dataBase}/cast-crew.json`),
    fetch(`${CONFIG.dataBase}/related-review-rules.json`)
  ]);
  if (!moviesResponse.ok || !castResponse.ok || !rulesResponse.ok) {
    throw new Error('Could not load review data.');
  }
  state.movies = await moviesResponse.json();
  state.castCrew = await castResponse.json();
  state.rules = await rulesResponse.json();
  state.movieBySlug = new Map(state.movies.map(movie => [movie.s, movie]));
}

async function init() {
  setupNavigation();
  setAsset($('#brandArtwork'), 'header');
  try {
    await loadData();
    const slug = resolveSlug();
    const movie = state.movieBySlug.get(slug) || state.movies[0];
    if (!movie) throw new Error('No reviews were found.');
    renderMovie(movie);
  } catch (error) {
    $('#content').innerHTML = `<section class="loading-card">${error.message || 'Unable to load the page.'}</section>`;
    $('#app').setAttribute('aria-busy', 'false');
  }
}

init();