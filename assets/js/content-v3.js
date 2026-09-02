const ASSET_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v3';
const ASSET_VERSION = '20260902-content-v3-runtime-1';
const asset = name => `${ASSET_BASE}/${name}?v=${ASSET_VERSION}`;

const state = { movies: [], castCrew: null, rules: null, activeMovie: null };
const $ = (selector, root = document) => root.querySelector(selector);

function stars(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return String(value);
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)));
}

function requestedSlug() {
  const url = new URL(location.href);
  return url.searchParams.get('review') || location.pathname.split('/').filter(Boolean).at(-1) || '';
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
    ['Music Director', record.music_directors]
  ].filter(([, values]) => values?.length);
}

function intersect(a = [], b = []) {
  const right = new Set(b.map(value => value.toLocaleLowerCase()));
  return a.filter(value => right.has(value.toLocaleLowerCase()));
}
function dateDistanceDays(a, b) {
  const ta = Date.parse(a || '1970-01-01');
  const tb = Date.parse(b || '1970-01-01');
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.abs(ta - tb) / 86400000 : Number.MAX_SAFE_INTEGER;
}
function stableHash(value) {
  let hash = 2166136261;
  for (const c of String(value)) { hash ^= c.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function scoreRelated(current, candidate) {
  const a = normalizeCastRecord(current.s);
  const b = normalizeCastRecord(candidate.s);
  const sharedCast = [...intersect(a.actors, b.actors), ...intersect(a.actresses, b.actresses)];
  const sharedDirectors = intersect(a.directors, b.directors);
  const sharedMusic = intersect(a.music_directors, b.music_directors);
  const tierRules = Object.fromEntries((state.rules?.tiers || []).map(t => [t.name, t]));
  const castWeight = tierRules.shared_cast?.weight_per_shared_person ?? 100;
  const directorWeight = tierRules.shared_director?.weight_per_shared_person ?? 65;
  const musicWeight = tierRules.shared_music_director?.weight_per_shared_person ?? 25;
  const bonuses = state.rules?.bonuses || {};
  let tier = 99, score = 0, sharedPeople = [];
  if (sharedCast.length) {
    tier = 1; score = sharedCast.length * castWeight + sharedDirectors.length * directorWeight;
    if (sharedCast.length >= 2) score += bonuses.two_or_more_shared_cast_members || 0;
    if (sharedDirectors.length) score += bonuses.shared_cast_and_director || 0;
    sharedPeople = [...new Set([...sharedCast, ...sharedDirectors])];
  } else if (sharedDirectors.length) {
    tier = 2; score = sharedDirectors.length * directorWeight; sharedPeople = [...new Set(sharedDirectors)];
  } else if (sharedMusic.length) {
    tier = 3; score = sharedMusic.length * musicWeight; sharedPeople = [...new Set(sharedMusic)];
  }
  return { movie: candidate, score, tier, sharedPeople, releaseDistance: dateDistanceDays(current.rd, candidate.rd) };
}
function getRelated(current) {
  const max = state.rules?.max_results || 4;
  const scored = state.movies.filter(m => m.s !== current.s).map(m => scoreRelated(current, m)).filter(x => x.sharedPeople.length)
    .sort((a,b) => a.tier-b.tier || b.score-a.score || b.sharedPeople.length-a.sharedPeople.length || a.releaseDistance-b.releaseDistance || String(b.movie.d||'').localeCompare(String(a.movie.d||'')) || a.movie.s.localeCompare(b.movie.s));
  const primary = scored.filter(x => x.tier <= 2).slice(0,max);
  if (primary.length >= max) return primary;
  const selected = [...primary], used = new Set(primary.map(x => x.movie.s));
  for (const item of scored.filter(x => x.tier === 3)) {
    if (!used.has(item.movie.s)) { selected.push(item); used.add(item.movie.s); }
    if (selected.length >= max) return selected;
  }
  const language = String(current.l || '').trim().toLocaleLowerCase();
  if (language) {
    const fallback = state.movies.filter(m => m.s !== current.s && !used.has(m.s) && String(m.l||'').trim().toLocaleLowerCase() === language)
      .sort((a,b) => stableHash(`${current.s}|${a.s}`)-stableHash(`${current.s}|${b.s}`) || a.s.localeCompare(b.s));
    for (const movie of fallback) { selected.push({ movie, sharedPeople: [], tier:4, score:0 }); if (selected.length >= max) break; }
  }
  return selected;
}

function buildPage(movie) {
  const root = document.createElement('article');
  root.className = 'content-v3';
  root.innerHTML = `
    <section class="cv3-asset cv3-topnav" style="--asset:url('${asset('01_top_navigation.avif')}')">
      <button class="cv3-hotspot cv3-menu-hit" id="cv3Menu" aria-label="Open menu"></button>
      <button class="cv3-hotspot cv3-search-hit" id="cv3Search" aria-label="Search reviews"></button>
    </section>

    <section class="cv3-asset cv3-clapboard" style="--asset:url('${asset('02_clapboard_details.avif')}')" aria-label="Movie details">
      <img class="cv3-poster" src="${movie.m}" alt="${movie.t} poster">
      <div class="cv3-title">${movie.t}</div>
      <div class="cv3-language">${movie.l || '—'}</div>
      <div class="cv3-release">${formatDate(movie.rd)}</div>
      <div class="cv3-rating" aria-label="${Math.round(Number(movie.r)||0)} out of 5 stars">${stars(movie.r)}</div>
      <div class="cv3-cast"></div>
      <div class="cv3-pov">${movie.v || movie.e || ''}</div>
    </section>

    <section class="cv3-asset cv3-theater" style="--asset:url('${asset('03_theater_seats_reactions.avif')}')" aria-label="My review">
      <button class="cv3-theater-open" type="button" aria-label="Open full review"></button>
      <div class="cv3-inline-review">${movie.e || ''}</div>
      <button type="button" class="reaction-button cv3-reaction cv3-like" data-vote="like" aria-label="Like this review"><span class="like-count">0</span></button>
      <button type="button" class="reaction-button cv3-reaction cv3-dislike" data-vote="dislike" aria-label="Dislike this review"><span class="dislike-count">0</span></button>
    </section>

    <section class="cv3-asset cv3-share" style="--asset:url('${asset('04_share_this_review.avif')}')" aria-label="Share this review">
      <button class="cv3-share-hit" data-share="whatsapp" aria-label="Share on WhatsApp"></button>
      <button class="cv3-share-hit" data-share="x" aria-label="Share on X"></button>
      <button class="cv3-share-hit" data-share="instagram" aria-label="Share using Instagram"></button>
      <button class="cv3-share-hit" data-share="copy" aria-label="Copy review link"></button>
      <button class="cv3-share-hit" data-share="more" aria-label="More share options"></button>
      <span class="cv3-share-status" role="status"></span>
    </section>

    <section class="cv3-asset cv3-related" style="--asset:url('${asset('05_related_reviews.avif')}')" aria-label="Related reviews">
      <div class="cv3-related-grid"></div>
    </section>

    <section class="cv3-asset cv3-comments" style="--asset:url('${asset('06_share_your_opinion.avif')}')" aria-label="Share your opinion">
      <div class="comment-list"></div>
      <form class="comment-form">
        <label class="sr-only" for="commentName">Name</label>
        <input id="commentName" name="name" required maxlength="60" autocomplete="name">
        <label class="sr-only" for="commentText">Comment</label>
        <textarea id="commentText" name="comment" required maxlength="1200"></textarea>
        <button type="submit" aria-label="Submit comment"></button>
        <p class="comment-status" role="status"></p>
      </form>
    </section>

    <section class="cv3-asset cv3-bottomnav" style="--asset:url('${asset('07_bottom_navigation.avif')}')" aria-label="Bottom navigation">
      <a class="cv3-bottom-hit cv3-lounge" href="/" aria-label="Lounge"></a>
      <a class="cv3-bottom-hit cv3-cafe" href="/cine-cafe/" aria-label="Cini Cafe"></a>
    </section>

    <div class="cv3-popup" id="cv3Popup" hidden aria-hidden="true">
      <div class="cv3-popup-backdrop" data-close-popup></div>
      <section class="cv3-popup-theater" role="dialog" aria-modal="true" aria-label="Full review" style="--asset:url('${asset('03a_theater_popup_shell_with_reactions.avif')}')">
        <button class="cv3-popup-exit" type="button" data-close-popup aria-label="Exit full review"></button>
        <article class="cv3-popup-review">${movie.body || `<p>${movie.e || ''}</p>`}</article>
        <button type="button" class="reaction-button cv3-popup-reaction cv3-popup-like" data-vote="like" aria-label="Like this review"><span class="like-count">0</span></button>
        <button type="button" class="reaction-button cv3-popup-reaction cv3-popup-dislike" data-vote="dislike" aria-label="Dislike this review"><span class="dislike-count">0</span></button>
      </section>
    </div>`;

  const cast = $('.cv3-cast', root);
  for (const [label, values] of castGroups(movie.s)) {
    const row = document.createElement('div');
    row.className = 'cv3-cast-row';
    row.innerHTML = `<span>${label}</span><strong>${values.join(', ')}</strong>`;
    cast.append(row);
  }
  renderRelated($('.cv3-related-grid', root), movie);
  return root;
}

function renderRelated(grid, movie) {
  for (const item of getRelated(movie).slice(0,4)) {
    const a = document.createElement('a');
    a.className = 'cv3-related-card';
    a.href = `/?review=${encodeURIComponent(item.movie.s)}`;
    a.innerHTML = `<img src="${item.movie.m}" alt="${item.movie.t} poster" loading="lazy"><span>${item.movie.t}</span><small>${stars(item.movie.r)}</small>`;
    grid.append(a);
  }
}

function setupMenuAndSearch() {
  const drawer = $('#menuDrawer');
  const backdrop = $('#drawerBackdrop');
  const openMenu = () => { drawer.dataset.open='true'; drawer.setAttribute('aria-hidden','false'); backdrop.hidden=false; };
  const closeMenu = () => { drawer.dataset.open='false'; drawer.setAttribute('aria-hidden','true'); backdrop.hidden=true; };
  $('#cv3Menu')?.addEventListener('click', openMenu);
  $('#menuClose')?.addEventListener('click', closeMenu);
  backdrop?.addEventListener('click', closeMenu);
  drawer?.querySelector('[data-action="search"]')?.addEventListener('click', () => { closeMenu(); openSearch(); });
  drawer?.querySelector('[data-action="browse"]')?.addEventListener('click', () => { closeMenu(); openSearch(); });
  drawer?.querySelector('[data-action="languages"]')?.addEventListener('click', () => { closeMenu(); openSearch(); });
  $('#cv3Search')?.addEventListener('click', openSearch);
  $('#searchClose')?.addEventListener('click', () => $('#searchDialog')?.close());
  $('#searchInput')?.addEventListener('input', event => renderSearchResults(event.target.value));
}
function renderSearchResults(query='') {
  const container = $('#searchResults');
  if (!container) return;
  container.replaceChildren();
  const q = query.trim().toLocaleLowerCase();
  state.movies.filter(m => !q || m.t.toLocaleLowerCase().includes(q) || String(m.l||'').toLocaleLowerCase().includes(q)).slice(0,30).forEach(movie => {
    const a=document.createElement('a'); a.className='search-result'; a.href=`/?review=${encodeURIComponent(movie.s)}`; a.textContent=movie.t;
    const small=document.createElement('small'); small.textContent=`${movie.l||'—'} • ${formatDate(movie.rd)}`; a.append(small); container.append(a);
  });
}
function openSearch() {
  renderSearchResults(''); const dialog=$('#searchDialog'); if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open','');
  requestAnimationFrame(() => $('#searchInput')?.focus());
}

function setupPopup(root) {
  const popup = $('#cv3Popup', root);
  const open = () => {
    popup.hidden = false; popup.setAttribute('aria-hidden','false'); document.documentElement.classList.add('cv3-popup-open');
    requestAnimationFrame(() => $('.cv3-popup-exit', popup)?.focus());
  };
  const close = () => { popup.hidden=true; popup.setAttribute('aria-hidden','true'); document.documentElement.classList.remove('cv3-popup-open'); };
  $('.cv3-theater-open', root)?.addEventListener('click', open);
  popup.querySelectorAll('[data-close-popup]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popup.hidden) close(); });
}

function setupSharing(root, movie) {
  const url = location.href;
  const text = `${movie.t} — Movie Reviews By Poorna`;
  const status = $('.cv3-share-status', root);
  const nativeShare = async () => {
    if (navigator.share) { await navigator.share({ title: text, text, url }); return true; }
    return false;
  };
  root.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', async () => {
    const kind = button.dataset.share;
    try {
      if (kind === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
      else if (kind === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank', 'noopener');
      else if (kind === 'copy') { await navigator.clipboard.writeText(url); status.textContent='Link copied'; setTimeout(()=>status.textContent='',1800); }
      else if (kind === 'instagram') {
        if (!(await nativeShare())) { await navigator.clipboard.writeText(url); status.textContent='Link copied — paste it in Instagram'; setTimeout(()=>status.textContent='',2500); }
      } else if (!(await nativeShare())) {
        await navigator.clipboard.writeText(url); status.textContent='Link copied'; setTimeout(()=>status.textContent='',1800);
      }
    } catch (error) { if (error?.name !== 'AbortError') status.textContent='Unable to share right now'; }
  }));
}

async function init() {
  document.documentElement.classList.add('content-v3-active');
  $('#brandHeader')?.setAttribute('hidden','');
  const [moviesRes, castRes, rulesRes] = await Promise.all([
    fetch('/data/index.json', { headers:{accept:'application/json'} }),
    fetch('/data/cast-crew.json', { headers:{accept:'application/json'} }),
    fetch('/data/related-review-rules.json', { headers:{accept:'application/json'} })
  ]);
  if (!moviesRes.ok || !castRes.ok || !rulesRes.ok) throw new Error('Unable to load review data');
  [state.movies, state.castCrew, state.rules] = await Promise.all([moviesRes.json(), castRes.json(), rulesRes.json()]);
  const slug = requestedSlug();
  const movie = state.movies.find(m => m.s === slug) || state.movies[0];
  if (!movie) throw new Error('Review not found');
  state.activeMovie = movie;
  document.title = `${movie.t} — Movie Reviews By Poorna`;
  document.documentElement.dataset.activeReviewSlug = movie.s;
  const root = buildPage(movie);
  $('#content').replaceChildren(root);
  setupMenuAndSearch();
  setupPopup(root);
  setupSharing(root, movie);
  $('#app')?.setAttribute('aria-busy','false');
}

init().catch(error => {
  console.error(error);
  const content=$('#content'); if (content) content.innerHTML='<section class="loading-card">Unable to load this review.</section>';
  $('#app')?.setAttribute('aria-busy','false');
});
