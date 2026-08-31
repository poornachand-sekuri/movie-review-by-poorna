import { DurableObject } from 'cloudflare:workers';

const VOTER_COOKIE = 'mrp_voter';
const VOTER_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
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

async function forwardReaction(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, { allow: 'GET, POST' });
  }

  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'Cross-origin request rejected' }, 403);
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
  const headers = new Headers({
    'x-mrp-voter': voterKey
  });
  if (vote) headers.set('x-mrp-vote', vote);

  const storeResponse = await store.fetch('https://reaction-store.internal/', {
    method: request.method,
    headers
  });

  const response = new Response(storeResponse.body, storeResponse);
  response.headers.set('cache-control', 'no-store');
  response.headers.set('set-cookie', voterCookie(voterKey));
  return response;
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
    const mine = this.sql.exec('SELECT vote FROM votes WHERE voter_key = ?', voterKey).one();
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/reactions') return forwardReaction(request, env, url);
    return env.ASSETS.fetch(request);
  }
};
