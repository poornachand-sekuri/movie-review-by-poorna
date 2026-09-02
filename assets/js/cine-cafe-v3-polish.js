const REACTION_ENDPOINT = '/api/reactions';
const likeCache = new Map();
const inFlight = new Map();

function installCafeNavigation() {
  const stage = document.querySelector('#cineCafeStage');
  if (!stage) return false;

  if (!stage.querySelector('.hotspot-logo')) {
    const logo = document.createElement('a');
    logo.className = 'hotspot hotspot-logo';
    logo.href = '/';
    logo.setAttribute('aria-label', 'Go to Home');
    stage.append(logo);
  }

  const menu = stage.querySelector('.hotspot-menu');
  if (menu) menu.setAttribute('aria-label', 'Go to Home');
  return true;
}

document.addEventListener('click', event => {
  const menu = event.target.closest?.('.hotspot-menu');
  if (!menu) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  location.assign('/');
}, true);

function installResultNavigation(results) {
  if (!results || results.dataset.reviewNavigationMounted === 'true') return;
  results.dataset.reviewNavigationMounted = 'true';

  results.addEventListener('click', event => {
    const card = event.target.closest?.('.review-card');
    if (!card || !results.contains(card)) return;
    const link = card.querySelector('.review-link');
    if (!link?.href) return;

    /* Preserve normal desktop modifier-click behaviour, while making a regular
       mobile tap anywhere inside the visual result plaque deterministic. */
    if (event.button && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    location.assign(link.href);
  });
}

function slugForCard(card) {
  const link = card.querySelector('.review-link');
  if (!link) return '';
  try {
    return new URL(link.href, location.href).searchParams.get('review') || '';
  } catch {
    return '';
  }
}

async function requestLikes(slug) {
  if (likeCache.has(slug)) return likeCache.get(slug);
  if (inFlight.has(slug)) return inFlight.get(slug);

  const request = fetch(`${REACTION_ENDPOINT}?slug=${encodeURIComponent(slug)}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    cache: 'no-store'
  }).then(async response => {
    if (!response.ok) throw new Error(`Reaction API returned ${response.status}`);
    const payload = await response.json();
    const likes = Math.max(0, Number(payload?.like) || 0);
    likeCache.set(slug, likes);
    return likes;
  }).finally(() => inFlight.delete(slug));

  inFlight.set(slug, request);
  return request;
}

function paintLike(node, likes) {
  node.dataset.liveLikesState = 'ready';
  node.removeAttribute('data-loading');
  node.removeAttribute('data-unavailable');
  node.textContent = String(likes);
  node.setAttribute('aria-label', `${likes} like${likes === 1 ? '' : 's'}`);
}

function hydrateCard(card) {
  const node = card.querySelector('.review-likes');
  const slug = slugForCard(card);
  if (!node || !slug) return;
  if (node.dataset.liveLikesSlug === slug && node.dataset.liveLikesState) return;

  node.dataset.liveLikesSlug = slug;
  if (likeCache.has(slug)) {
    paintLike(node, likeCache.get(slug));
    return;
  }

  node.dataset.liveLikesState = 'loading';
  node.dataset.loading = 'true';
  node.textContent = '';
  node.setAttribute('aria-label', 'Loading likes');

  requestLikes(slug).then(likes => {
    if (node.dataset.liveLikesSlug !== slug) return;
    paintLike(node, likes);
  }).catch(() => {
    if (node.dataset.liveLikesSlug !== slug) return;
    node.dataset.liveLikesState = 'unavailable';
    node.removeAttribute('data-loading');
    node.dataset.unavailable = 'true';
    node.textContent = '';
    node.setAttribute('aria-label', 'Likes temporarily unavailable');
  });
}

function hydrateVisibleCards() {
  document.querySelectorAll('#resultsLayer .review-card').forEach(hydrateCard);
}

function install() {
  const stageReady = installCafeNavigation();
  const results = document.querySelector('#resultsLayer');
  if (!stageReady || !results) return false;

  installResultNavigation(results);
  hydrateVisibleCards();
  const observer = new MutationObserver(hydrateVisibleCards);
  observer.observe(results, { childList: true });
  return true;
}

if (!install()) {
  const observer = new MutationObserver(() => {
    if (!install()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
