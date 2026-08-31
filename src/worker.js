import { DurableObject } from 'cloudflare:workers';

const VOTER_COOKIE = 'mrp_voter';
const VOTER_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const COMMENT_RATE_LIMIT_MS = 30 * 1000;
const COMMENT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const PUBLIC_COMMENT_LIMIT = 10;
let catalogSlugsPromise;

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...valueParts] = part.trim().split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return null;
}

function voterCookie(value) {
  return `${VOTER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${VOTER_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function safeVoterKey(request) {
  const existing = cookieValue(request, VOTER_COOKIE);
  if (existing && /^[a-f0-9-]{20,80}$/i.test(existing)) return existing;
  return crypto.randomUUID();
}

function sameOriginWrite(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function catalogSlugs(env, requestUrl) {
  if (!catalogSlugsPromise) {
    catalogSlugsPromise = (async () => {
      const dataUrl = new URL('/data/index.json', requestUrl);
      const response = await env.ASSETS.fetch(dataUrl);
      if (!response.ok) throw new Error('Could not load review catalog');
      const reviews = await response.json();
      return new Set((Array.isArray(reviews) ? reviews : []).map(review => review?.s).filter(Boolean));
    })().catch(error => {
      catalogSlugsPromise = undefined;
      throw error;
    });
  }
  return catalogSlugsPromise;
}

async function validSlug(env, requestUrl, slug) {
  if (!slug || typeof slug !== 'string' || slug.length > 160) return false;
  const slugs = await catalogSlugs(env, requestUrl);
  return slugs.has(slug);
}

async function validCommentTarget(env, requestUrl, target, targetId) {
  if (target === 'home') return targetId === 'home';
  if (target === 'review') return validSlug(env, requestUrl, targetId);
  return false;
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanComment(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseCommentTarget(url, body = null) {
  const legacySlug = body?.slug ?? url.searchParams.get('slug');
  const target = String(body?.target ?? url.searchParams.get('target') ?? (legacySlug ? 'review' : '')).trim().toLowerCase();
  const targetId = String(body?.target_id ?? url.searchParams.get('target_id') ?? legacySlug ?? '').trim();
  return { target, targetId };
}

function adminAuthorized(request, env) {
  const expected = String(env.ADMIN_COMMENTS_TOKEN || '');
  if (!expected) return false;
  const authorization = request.headers.get('authorization') || '';
  return authorization === `Bearer ${expected}`;
}

async function forwardReaction(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
  }

  if (request.method === 'POST' && !sameOriginWrite(request, url)) {
    return json({ error: 'Cross-origin request rejected' }, 403);
  }

  let slug;
  let vote = null;
  if (request.method === 'GET') {
    slug = url.searchParams.get('slug') || '';
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    slug = typeof body?.slug === 'string' ? body.slug : '';
    vote = body?.vote;
    if (vote !== 'like' && vote !== 'dislike') return json({ error: 'Vote must be like or dislike' }, 400);
  }

  try {
    if (!(await validSlug(env, request.url, slug))) return json({ error: 'Unknown review slug' }, 404);
  } catch {
    return json({ error: 'Review catalog unavailable' }, 503);
  }

  const voterKey = safeVoterKey(request);
  const store = env.REACTIONS.getByName(slug);
  const headers = new Headers({ 'x-mrp-voter': voterKey });
  if (vote) headers.set('x-mrp-vote', vote);

  const storeResponse = await store.fetch('https://reaction-store.internal/', {
    method: request.method,
    headers
  });

  const response = new Response(storeResponse.body, {
    status: storeResponse.status,
    statusText: storeResponse.statusText,
    headers: storeResponse.headers
  });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('set-cookie', voterCookie(voterKey));
  return response;
}

async function forwardComments(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
  }

  let body = null;
  if (request.method === 'POST') {
    if (!sameOriginWrite(request, url)) return json({ error: 'Cross-origin request rejected' }, 403);
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
  }

  const { target, targetId } = parseCommentTarget(url, body);
  try {
    if (!(await validCommentTarget(env, request.url, target, targetId))) {
      return json({ error: 'Unknown comments target' }, 404);
    }
  } catch {
    return json({ error: 'Review catalog unavailable' }, 503);
  }

  const store = env.COMMENTS.getByName('global-comments');

  if (request.method === 'GET') {
    const internalUrl = new URL('https://comments-store.internal/public');
    internalUrl.searchParams.set('target', target);
    internalUrl.searchParams.set('target_id', targetId);
    internalUrl.searchParams.set('limit', String(PUBLIC_COMMENT_LIMIT));
    return store.fetch(internalUrl, { method: 'GET' });
  }

  if (String(body?.website || '').trim()) {
    return json({ status: 'pending' }, 202);
  }

  const name = cleanName(body?.name);
  const email = cleanEmail(body?.email);
  const comment = cleanComment(body?.comment);

  if (name.length < 1 || name.length > 60) return json({ error: 'Name must be between 1 and 60 characters' }, 400);
  if (email.length < 3 || email.length > 120 || !validEmail(email)) return json({ error: 'Please enter a valid email address' }, 400);
  if (comment.length < 3 || comment.length > 1200) return json({ error: 'Comment must be between 3 and 1200 characters' }, 400);

  const voterKey = safeVoterKey(request);
  const storeResponse = await store.fetch('https://comments-store.internal/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mrp-voter': voterKey
    },
    body: JSON.stringify({ target, targetId, name, email, comment })
  });

  const response = new Response(storeResponse.body, {
    status: storeResponse.status,
    statusText: storeResponse.statusText,
    headers: storeResponse.headers
  });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('set-cookie', voterCookie(voterKey));
  return response;
}

async function forwardAdminComments(request, env, url) {
  if (!env.ADMIN_COMMENTS_TOKEN) {
    return json({ error: 'Comments moderation is not configured' }, 503);
  }
  if (!adminAuthorized(request, env)) return json({ error: 'Unauthorized' }, 401);

  const store = env.COMMENTS.getByName('global-comments');
  const pathPrefix = '/api/admin/comments';
  const remainder = url.pathname.slice(pathPrefix.length).replace(/^\/+/, '');

  if (request.method === 'GET' && !remainder) {
    const internalUrl = new URL('https://comments-store.internal/admin/list');
    for (const key of ['status', 'target', 'target_id', 'limit']) {
      const value = url.searchParams.get(key);
      if (value) internalUrl.searchParams.set(key, value);
    }
    return store.fetch(internalUrl, { method: 'GET' });
  }

  if (request.method === 'POST' && remainder) {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    const action = String(body?.action || '').trim().toLowerCase();
    if (!['approve', 'reject', 'delete'].includes(action)) {
      return json({ error: 'Action must be approve, reject or delete' }, 400);
    }
    return store.fetch('https://comments-store.internal/admin/moderate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: decodeURIComponent(remainder), action })
    });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export class ReactionStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS votes (
        voter_key TEXT PRIMARY KEY,
        vote TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS votes_vote_idx ON votes(vote);
    `);
  }

  snapshot(voterKey) {
    const totals = this.sql.exec(`
      SELECT
        COALESCE(SUM(CASE WHEN vote = 'like' THEN 1 ELSE 0 END), 0) AS like_count,
        COALESCE(SUM(CASE WHEN vote = 'dislike' THEN 1 ELSE 0 END), 0) AS dislike_count
      FROM votes
    `).one();
    const mine = this.sql.exec('SELECT vote FROM votes WHERE voter_key = ?', voterKey).toArray()[0] || null;
    return {
      like: Number(totals?.like_count) || 0,
      dislike: Number(totals?.dislike_count) || 0,
      myVote: mine?.vote || null
    };
  }

  async fetch(request) {
    const voterKey = request.headers.get('x-mrp-voter');
    if (!voterKey) return json({ error: 'Missing voter identity' }, 400);

    if (request.method === 'POST') {
      const vote = request.headers.get('x-mrp-vote');
      if (vote !== 'like' && vote !== 'dislike') return json({ error: 'Invalid vote' }, 400);
      this.sql.exec(
        `INSERT INTO votes (voter_key, vote, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(voter_key) DO UPDATE SET
           vote = excluded.vote,
           updated_at = excluded.updated_at`,
        voterKey,
        vote,
        new Date().toISOString()
      );
    } else if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    return json(this.snapshot(voterKey));
  }
}

export class CommentsStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        comment TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','deleted')),
        client_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        moderated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS comments_public_idx
        ON comments(target_type, target_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS comments_moderation_idx
        ON comments(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS comments_client_idx
        ON comments(client_key, created_at DESC);
    `);
  }

  publicComments(url) {
    const target = url.searchParams.get('target') || '';
    const targetId = url.searchParams.get('target_id') || '';
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || PUBLIC_COMMENT_LIMIT));
    const comments = this.sql.exec(
      `SELECT id, name, comment, created_at
       FROM comments
       WHERE target_type = ? AND target_id = ? AND status = 'approved'
       ORDER BY created_at DESC
       LIMIT ?`,
      target,
      targetId,
      limit
    ).toArray();
    return json({ comments });
  }

  submit(request) {
    return request.json().then(body => {
      const clientKey = request.headers.get('x-mrp-voter') || '';
      if (!clientKey) return json({ error: 'Missing client identity' }, 400);

      const now = Date.now();
      const latest = this.sql.exec(
        'SELECT created_at FROM comments WHERE client_key = ? ORDER BY created_at DESC LIMIT 1',
        clientKey
      ).toArray()[0] || null;
      if (latest?.created_at) {
        const elapsed = now - Date.parse(latest.created_at);
        if (Number.isFinite(elapsed) && elapsed < COMMENT_RATE_LIMIT_MS) {
          return json({ error: 'Please wait a moment before submitting another comment' }, 429);
        }
      }

      const duplicateSince = new Date(now - COMMENT_DUPLICATE_WINDOW_MS).toISOString();
      const duplicate = this.sql.exec(
        `SELECT id FROM comments
         WHERE client_key = ? AND target_type = ? AND target_id = ? AND comment = ?
           AND created_at >= ? AND status != 'deleted'
         LIMIT 1`,
        clientKey,
        body.target,
        body.targetId,
        body.comment,
        duplicateSince
      ).toArray()[0] || null;
      if (duplicate) return json({ error: 'This comment was already submitted' }, 409);

      const id = crypto.randomUUID();
      const createdAt = new Date(now).toISOString();
      this.sql.exec(
        `INSERT INTO comments
          (id, target_type, target_id, name, email, comment, status, client_key, created_at, moderated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)`,
        id,
        body.target,
        body.targetId,
        body.name,
        body.email,
        body.comment,
        clientKey,
        createdAt
      );
      return json({ status: 'pending', id }, 202);
    });
  }

  adminList(url) {
    const allowedStatuses = new Set(['pending', 'approved', 'rejected', 'deleted', 'all']);
    const status = allowedStatuses.has(url.searchParams.get('status')) ? url.searchParams.get('status') : 'pending';
    const target = url.searchParams.get('target');
    const targetId = url.searchParams.get('target_id');
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 100));

    const clauses = [];
    const params = [];
    if (status !== 'all') {
      clauses.push('status = ?');
      params.push(status);
    }
    if (target) {
      clauses.push('target_type = ?');
      params.push(target);
    }
    if (targetId) {
      clauses.push('target_id = ?');
      params.push(targetId);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const comments = this.sql.exec(
      `SELECT id, target_type, target_id, name, email, comment, status, created_at, moderated_at
       FROM comments
       ${where}
       ORDER BY created_at DESC
       LIMIT ?`,
      ...params,
      limit
    ).toArray();
    return json({ comments });
  }

  moderate(request) {
    return request.json().then(body => {
      const statusByAction = {
        approve: 'approved',
        reject: 'rejected',
        delete: 'deleted'
      };
      const nextStatus = statusByAction[body.action];
      if (!nextStatus || !body.id) return json({ error: 'Invalid moderation request' }, 400);

      const existing = this.sql.exec('SELECT id FROM comments WHERE id = ?', body.id).toArray()[0] || null;
      if (!existing) return json({ error: 'Comment not found' }, 404);

      const moderatedAt = new Date().toISOString();
      this.sql.exec(
        'UPDATE comments SET status = ?, moderated_at = ? WHERE id = ?',
        nextStatus,
        moderatedAt,
        body.id
      );
      return json({ id: body.id, status: nextStatus, moderated_at: moderatedAt });
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/public') return this.publicComments(url);
    if (request.method === 'POST' && url.pathname === '/submit') return this.submit(request);
    if (request.method === 'GET' && url.pathname === '/admin/list') return this.adminList(url);
    if (request.method === 'POST' && url.pathname === '/admin/moderate') return this.moderate(request);
    return json({ error: 'Not found' }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/reactions') return forwardReaction(request, env, url);
    if (url.pathname === '/api/comments') return forwardComments(request, env, url);
    if (url.pathname === '/api/admin/comments' || url.pathname.startsWith('/api/admin/comments/')) {
      return forwardAdminComments(request, env, url);
    }
    return env.ASSETS.fetch(request);
  }
};
