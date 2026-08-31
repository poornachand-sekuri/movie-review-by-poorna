import { CONFIG, uiAsset } from './config.js';

const $ = (selector, root = document) => root.querySelector(selector);

function formatDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, day)));
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
  const form = $('.comment-form', root);
  const status = $('.comment-status', root);
  if (!list || !form || !status) return;

  const comments = await loadComments(movie.s);
  list.replaceChildren();
  if (comments.length) {
    comments.forEach(comment => list.append(commentCard(comment)));
  } else {
    const empty = document.createElement('p');
    empty.className = 'comment-empty';
    empty.textContent = CONFIG.apiBase
      ? 'No approved comments yet. Be the first to share your opinion.'
      : 'Comments backend is not connected on this preview branch yet.';
    list.append(empty);
  }

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
    if (!submit) return;

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

function cloneCommentsSection(movie) {
  const template = $('#reviewTemplate');
  const source = template?.content?.querySelector('.comments-section');
  if (!source) throw new Error('Comments template is unavailable.');

  const section = source.cloneNode(true);
  section.classList.add('hm3-comments-section');
  section.setAttribute('aria-label', `Share your opinion on ${movie.t}`);

  const header = $('.comments-header', section);
  if (header) {
    header.src = uiAsset('commentsHeader');
    header.decoding = 'async';
  }

  const background = $('.comments-bg', section);
  if (background) {
    background.style.backgroundImage = `url("${uiAsset('commentsShell')}")`;
  }

  return section;
}

function waitForHomePage() {
  const existing = $('.hm3-page');
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const target = $('#content') || document.body;
    const observer = new MutationObserver(() => {
      const page = $('.hm3-page');
      if (!page) return;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(page);
    });

    const timeout = setTimeout(() => {
      observer.disconnect();
      reject(new Error('Home page did not finish loading.'));
    }, 10000);

    observer.observe(target, { childList: true, subtree: true });
  });
}

async function initHomeComments() {
  try {
    const page = await waitForHomePage();
    if ($('.hm3-comments-wrap', page)) return;

    const featuredLink = $('.hm3-now-poster', page);
    const title = $('.hm3-now-title', page)?.textContent.trim() || 'Latest Review';
    const slug = featuredLink
      ? new URL(featuredLink.href, location.href).searchParams.get('review')
      : null;
    if (!slug) throw new Error('Could not identify the Now Reviewed movie.');

    const movie = { s: slug, t: title };
    const wrap = document.createElement('div');
    wrap.className = 'hm3-comments-wrap';
    wrap.append(cloneCommentsSection(movie));
    page.append(wrap);

    await setupComments(wrap, movie);
  } catch (error) {
    console.error('Unable to add Home-page comments:', error);
  }
}

initHomeComments();
