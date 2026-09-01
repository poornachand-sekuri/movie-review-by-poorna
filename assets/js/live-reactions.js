const API_ENDPOINT = '/api/reactions';
let activeSlug = null;
let hydrationStarted = false;

function reactionStorageKey(slug) {
  return `mrp-reactions:${slug}`;
}

function getLegacyReaction(slug) {
  try {
    const parsed = JSON.parse(localStorage.getItem(reactionStorageKey(slug)) || '{}');
    const myVote = parsed?.myVote === 'like' || parsed?.myVote === 'dislike' ? parsed.myVote : null;
    return { myVote };
  } catch {
    return { myVote: null };
  }
}

function clearLegacyReaction(slug) {
  try {
    localStorage.removeItem(reactionStorageKey(slug));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; live counts still work.
  }
}

function resolveSlug() {
  const url = new URL(location.href);
  const fromPage = document.documentElement.dataset.activeReviewSlug || null;
  const fromQuery = url.searchParams.get('review');
  const pathSlug = url.pathname.split('/').filter(Boolean).at(-1) || null;
  return fromPage || fromQuery || pathSlug;
}

function normalize(values) {
  const myVote = values?.myVote === 'like' || values?.myVote === 'dislike' ? values.myVote : null;
  return {
    like: Math.max(0, Number(values?.like) || 0),
    dislike: Math.max(0, Number(values?.dislike) || 0),
    myVote
  };
}

async function requestReaction(slug, vote = null) {
  const options = {
    credentials: 'same-origin',
    headers: { accept: 'application/json' }
  };
  let url = `${API_ENDPOINT}?slug=${encodeURIComponent(slug)}`;
  if (vote) {
    url = API_ENDPOINT;
    options.method = 'POST';
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify({ slug, vote });
  }

  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Reaction API returned ${response.status}`);
  return normalize(await response.json());
}

function paint(values) {
  const like = document.querySelector('.like-count');
  const dislike = document.querySelector('.dislike-count');
  if (!like || !dislike) return;

  like.textContent = String(values.like);
  dislike.textContent = String(values.dislike);
  document.querySelectorAll('.reaction-button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.vote === values.myVote));
    button.removeAttribute('title');
  });
}

function paintUnavailable() {
  const like = document.querySelector('.like-count');
  const dislike = document.querySelector('.dislike-count');
  if (like) like.textContent = '—';
  if (dislike) dislike.textContent = '—';
  document.querySelectorAll('.reaction-button').forEach(button => {
    button.setAttribute('title', 'Live reaction counts are temporarily unavailable');
  });
}

async function hydrate() {
  if (hydrationStarted || !activeSlug) return;
  hydrationStarted = true;

  try {
    let values = await requestReaction(activeSlug);
    const legacy = getLegacyReaction(activeSlug);

    // Recover this browser's old preview vote into the shared store once.
    if (!values.myVote && legacy.myVote) {
      values = await requestReaction(activeSlug, legacy.myVote);
    }

    clearLegacyReaction(activeSlug);
    paint(values);
  } catch {
    paintUnavailable();
  }
}

function hydrateWhenReady() {
  if (!document.querySelector('.reaction-button')) return false;
  requestAnimationFrame(() => hydrate());
  return true;
}

document.addEventListener('click', async event => {
  const button = event.target.closest?.('.reaction-button');
  if (!button) return;

  // The original preview handler is still attached by app.js. Capture the click here
  // so only the live persistent endpoint is allowed to mutate reaction state.
  event.preventDefault();
  event.stopImmediatePropagation();

  const vote = button.dataset.vote;
  if (!activeSlug || (vote !== 'like' && vote !== 'dislike')) return;

  const buttons = [...document.querySelectorAll('.reaction-button')];
  buttons.forEach(item => { item.disabled = true; });
  try {
    const values = await requestReaction(activeSlug, vote);
    clearLegacyReaction(activeSlug);
    paint(values);
  } catch {
    paintUnavailable();
  } finally {
    buttons.forEach(item => { item.disabled = false; });
  }
}, true);

async function start() {
  activeSlug = await resolveSlug();
  if (!activeSlug) return;
  if (hydrateWhenReady()) return;

  const observer = new MutationObserver(() => {
    if (hydrateWhenReady()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

start();
