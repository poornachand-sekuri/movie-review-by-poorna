const COMMENTS_ENDPOINT = '/api/comments';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  }).format(date);
}

function commentCard(comment) {
  const card = document.createElement('article');
  card.className = 'comment-card';

  const name = document.createElement('strong');
  name.textContent = comment?.name || 'Movie Lover';

  const body = document.createElement('p');
  body.textContent = comment?.comment || '';

  const time = document.createElement('time');
  time.textContent = formatDate(comment?.created_at);

  card.append(name, body, time);
  return card;
}

function normalizeTarget(targetType, targetId) {
  const type = String(targetType || '').trim().toLowerCase();
  const id = String(targetId || '').trim();
  if (!type || !id) throw new Error('Missing comments target');
  return { type, id };
}

async function readComments(targetType, targetId) {
  const target = normalizeTarget(targetType, targetId);
  const params = new URLSearchParams({ target: target.type, target_id: target.id });
  const response = await fetch(`${COMMENTS_ENDPOINT}?${params}`, {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('Could not load comments');
  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.comments || [];
}

async function submitComment(targetType, targetId, form) {
  const target = normalizeTarget(targetType, targetId);
  const data = new FormData(form);
  const payload = {
    target: target.type,
    target_id: target.id,
    name: String(data.get('name') || '').trim(),
    email: String(data.get('email') || '').trim(),
    comment: String(data.get('comment') || '').trim(),
    website: String(data.get('website') || '').trim()
  };

  const response = await fetch(COMMENTS_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let result = {};
  try {
    result = await response.json();
  } catch {
    // Keep the generic error below when a proxy returns non-JSON text.
  }

  if (!response.ok) {
    throw new Error(result.error || 'Could not submit comment');
  }
  return result;
}

export async function mountComments({ targetType, targetId, root = document } = {}) {
  const list = root.querySelector('.comment-list');
  const form = root.querySelector('.comment-form');
  const status = root.querySelector('.comment-status');
  if (!list || !form || !status) return false;
  if (form.dataset.commentsMounted === 'true') return true;
  form.dataset.commentsMounted = 'true';

  const honeypot = document.createElement('input');
  honeypot.type = 'text';
  honeypot.name = 'website';
  honeypot.tabIndex = -1;
  honeypot.autocomplete = 'off';
  honeypot.setAttribute('aria-hidden', 'true');
  honeypot.style.position = 'absolute';
  honeypot.style.left = '-10000px';
  honeypot.style.width = '1px';
  honeypot.style.height = '1px';
  honeypot.style.opacity = '0';
  form.append(honeypot);

  const paint = comments => {
    list.replaceChildren();
    if (comments.length) {
      comments.forEach(comment => list.append(commentCard(comment)));
      return;
    }
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = 'No approved comments yet. Be the first to share your opinion.';
    list.append(empty);
  };

  try {
    paint(await readComments(targetType, targetId));
  } catch {
    list.replaceChildren();
    const unavailable = document.createElement('p');
    unavailable.className = 'comment-empty';
    unavailable.textContent = 'Comments are temporarily unavailable.';
    list.append(unavailable);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (!form.reportValidity()) return;
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    status.textContent = '';

    try {
      await submitComment(targetType, targetId, form);
      form.reset();
      status.textContent = 'Thank you. Your comment is awaiting approval.';
    } catch (error) {
      status.textContent = error?.message || 'Could not submit comment.';
    } finally {
      if (submit) submit.disabled = false;
    }
  }, true);

  return true;
}

function resolveReviewSlug() {
  const url = new URL(location.href);
  const fromPage = document.documentElement.dataset.activeReviewSlug || null;
  const fromQuery = url.searchParams.get('review');
  const pathSlug = url.pathname.split('/').filter(Boolean).at(-1) || null;
  return fromPage || fromQuery || pathSlug;
}

export async function mountReviewComments() {
  const slug = await resolveReviewSlug();
  if (!slug) return false;

  const tryMount = () => mountComments({ targetType: 'review', targetId: slug, root: document });
  if (document.querySelector('.comment-form')) return tryMount();

  const observer = new MutationObserver(() => {
    if (!document.querySelector('.comment-form')) return;
    observer.disconnect();
    tryMount();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return true;
}
