import baseWorker from './worker.js';

const COMMENT_DATA_KEY = '_system/comments-v1.json';
const SESSION_COOKIE = 'mrp_admin';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/comments') {
        if (request.method === 'GET') return listPublishedComments(env, url);
        if (request.method === 'POST') return submitComment(request, env);
      }

      if (url.pathname.startsWith('/api/admin/comments')) {
        if (!(await isAuthenticated(request, env))) return json({ error: 'Unauthorized.' }, 401);
        if (url.pathname === '/api/admin/comments' && request.method === 'GET') return listAdminComments(env, url);
        const match = url.pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
        if (match) {
          const id = decodeURIComponent(match[1]);
          if (request.method === 'PATCH' || request.method === 'PUT') return moderateComment(id, request, env);
          if (request.method === 'DELETE') return deleteComment(id, env);
        }
      }

      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error('comments worker error', error);
      if (url.pathname.startsWith('/api/comments') || url.pathname.startsWith('/api/admin/comments')) {
        return json({ error: 'Unexpected server error.' }, 500);
      }
      return baseWorker.fetch(request, env, ctx);
    }
  }
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

async function loadComments(env) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  const obj = await env.REVIEW_ASSETS.get(COMMENT_DATA_KEY);
  if (!obj) return { version: 1, comments: [] };
  try {
    const parsed = JSON.parse(await obj.text());
    return { version: 1, comments: Array.isArray(parsed.comments) ? parsed.comments : [] };
  } catch {
    return { version: 1, comments: [] };
  }
}

async function saveComments(env, store) {
  await env.REVIEW_ASSETS.put(COMMENT_DATA_KEY, JSON.stringify(store), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    customMetadata: { private: 'true', purpose: 'moderated-comments' }
  });
}

function normalizeScope(url) {
  const scope = String(url.searchParams.get('scope') || '').toLowerCase();
  if (scope === 'home') return { scope: 'home', slug: '' };
  if (scope === 'review') {
    const slug = cleanSlug(url.searchParams.get('slug') || '');
    if (!slug) return null;
    return { scope: 'review', slug };
  }
  return null;
}

async function listPublishedComments(env, url) {
  const target = normalizeScope(url);
  if (!target) return json({ error: 'A valid comment scope is required.' }, 400);
  const store = await loadComments(env);
  const comments = store.comments
    .filter(c => c.status === 'published' && c.scope === target.scope && (target.scope === 'home' || c.slug === target.slug))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 100)
    .map(publicComment);
  return json({ comments });
}

async function submitComment(request, env) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'Invalid submission.' }, 400);

  if (String(input.website || '').trim()) return json({ submitted: true, pending: true }, 202);

  const scope = String(input.scope || '').toLowerCase();
  const slug = scope === 'review' ? cleanSlug(input.slug || '') : '';
  if (scope !== 'home' && scope !== 'review') return json({ error: 'Invalid page target.' }, 400);
  if (scope === 'review' && !slug) return json({ error: 'Review target is required.' }, 400);

  const name = cleanText(input.name, 60);
  const email = cleanText(input.email, 160).toLowerCase();
  const body = cleanText(input.comment, 1200);
  if (name.length < 2) return json({ error: 'Please enter your name.' }, 400);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (body.length < 2) return json({ error: 'Please write a comment.' }, 400);

  const store = await loadComments(env);
  const now = new Date().toISOString();
  const comment = {
    id: makeId(),
    scope,
    slug,
    name,
    email,
    body,
    status: 'pending',
    created_at: now,
    moderated_at: null
  };
  store.comments.unshift(comment);
  if (store.comments.length > 5000) store.comments = store.comments.slice(0, 5000);
  await saveComments(env, store);
  return json({ submitted: true, pending: true }, 201);
}

async function listAdminComments(env, url) {
  const status = String(url.searchParams.get('status') || 'all').toLowerCase();
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const allowed = new Set(['all', 'pending', 'published', 'rejected']);
  if (!allowed.has(status)) return json({ error: 'Invalid status filter.' }, 400);
  const store = await loadComments(env);
  let comments = [...store.comments];
  if (status !== 'all') comments = comments.filter(c => c.status === status);
  if (q) comments = comments.filter(c => `${c.name} ${c.email} ${c.body} ${c.scope} ${c.slug}`.toLowerCase().includes(q));
  comments.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const counts = store.comments.reduce((acc, c) => {
    acc.all += 1;
    if (acc[c.status] != null) acc[c.status] += 1;
    return acc;
  }, { all: 0, pending: 0, published: 0, rejected: 0 });
  return json({ comments: comments.map(adminComment), counts });
}

async function moderateComment(id, request, env) {
  const input = await request.json().catch(() => ({}));
  const status = String(input.status || '').toLowerCase();
  if (!['published', 'rejected', 'pending'].includes(status)) return json({ error: 'Invalid moderation status.' }, 400);
  const store = await loadComments(env);
  const comment = store.comments.find(c => c.id === id);
  if (!comment) return json({ error: 'Comment not found.' }, 404);
  comment.status = status;
  comment.moderated_at = new Date().toISOString();
  await saveComments(env, store);
  return json({ comment: adminComment(comment) });
}

async function deleteComment(id, env) {
  const store = await loadComments(env);
  const before = store.comments.length;
  store.comments = store.comments.filter(c => c.id !== id);
  if (store.comments.length === before) return json({ error: 'Comment not found.' }, 404);
  await saveComments(env, store);
  return json({ deleted: true, id });
}

function publicComment(c) {
  return { id: c.id, name: c.name, comment: c.body, created_at: c.created_at };
}

function adminComment(c) {
  return {
    id: c.id, scope: c.scope, slug: c.slug || '', name: c.name, email: c.email || '', comment: c.body,
    status: c.status, created_at: c.created_at, moderated_at: c.moderated_at || null
  };
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function cleanSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9%-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}
function makeId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `c_${Date.now().toString(36)}_${[...bytes].map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

async function isAuthenticated(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookies = Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('=');
    return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
  }));
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const [expText, sig] = token.split('.');
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || !sig) return false;
  const expected = await signSession(exp, env.ADMIN_SESSION_SECRET);
  return secureEqual(sig, expected);
}

async function signSession(exp, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`admin:${exp}`));
  return base64url(new Uint8Array(bytes));
}
function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function secureEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
