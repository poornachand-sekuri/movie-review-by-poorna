import worker, {
  ReactionStore,
  CommentsStore,
  AnalyticsStore
} from './worker.js';
import { adminIsAuthenticated } from './admin-console.js';

export { ReactionStore, CommentsStore, AnalyticsStore };

const PUBLIC_DATA_CACHE_TTL_MS = 15_000;
const PUBLIC_DATA_BROWSER_MAX_AGE_SECONDS = 5;
const PUBLIC_DATA_STALE_SECONDS = 15;
const PUBLIC_DATA_CACHE_MAX_ENTRIES = 24;
const publicDataCache = new Map();

let derivedSessionSecretPromise;

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

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

function publicDataCacheKey(request, url) {
  if (request.method !== 'GET') return null;
  if (url.pathname === '/data/catalog.json') return 'catalog';
  if (url.pathname === '/data/cast-crew.json') return 'cast-crew';
  if (url.pathname === '/data/index.json') return 'index';
  if (url.pathname !== '/data/content.json') return null;
  return `content:${url.searchParams.get('review') || ''}`;
}

function prunePublicDataCache(now = Date.now()) {
  for (const [key, entry] of publicDataCache) {
    if (entry.expiresAt <= now) publicDataCache.delete(key);
  }
  while (publicDataCache.size > PUBLIC_DATA_CACHE_MAX_ENTRIES) {
    publicDataCache.delete(publicDataCache.keys().next().value);
  }
}

function responseFromPublicDataCache(entry, state) {
  const headers = new Headers(entry.headers);
  headers.set('x-mrp-data-cache', state);
  return new Response(entry.body.slice(), {
    status: entry.status,
    statusText: entry.statusText,
    headers
  });
}

async function cachedPublicData(request, runtime, ctx, cacheKey) {
  const now = Date.now();
  const cached = publicDataCache.get(cacheKey);

  if (cached?.expiresAt > now) {
    // Refresh insertion order so the bounded map behaves as a small LRU cache.
    publicDataCache.delete(cacheKey);
    publicDataCache.set(cacheKey, cached);
    return responseFromPublicDataCache(cached, 'HIT');
  }
  if (cached) publicDataCache.delete(cacheKey);

  const response = await worker.fetch(request, runtime, ctx);
  if (!response.ok) return response;

  const headers = new Headers(response.headers);
  headers.set(
    'cache-control',
    `public, max-age=${PUBLIC_DATA_BROWSER_MAX_AGE_SECONDS}, stale-while-revalidate=${PUBLIC_DATA_STALE_SECONDS}`
  );

  const entry = {
    status: response.status,
    statusText: response.statusText,
    headers: [...headers.entries()],
    body: new Uint8Array(await response.arrayBuffer()),
    expiresAt: now + PUBLIC_DATA_CACHE_TTL_MS
  };

  publicDataCache.set(cacheKey, entry);
  prunePublicDataCache(now);
  return responseFromPublicDataCache(entry, 'MISS');
}

async function derivedSessionSecret(password) {
  if (!derivedSessionSecretPromise) {
    derivedSessionSecretPromise = crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`movie-reviews-by-poorna:admin-session:v1:${password}`)
    ).then(buffer => hex(new Uint8Array(buffer)));
  }
  return derivedSessionSecretPromise;
}

async function runtimeEnv(env) {
  if (env.ADMIN_SESSION_SECRET || !env.ADMIN_PASSWORD) return env;
  const fallback = await derivedSessionSecret(String(env.ADMIN_PASSWORD));
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === 'ADMIN_SESSION_SECRET') return fallback;
      return Reflect.get(target, property, receiver);
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const runtime = await runtimeEnv(env);
    const url = new URL(request.url);

    // Any public page viewed while this browser has a valid Admin session is an
    // operational visit (Preview / View Site / manual Admin browsing), not audience traffic.
    if (url.pathname === '/api/analytics/pageview' && request.method === 'POST') {
      if (await adminIsAuthenticated(request, runtime)) {
        return json({ tracked: false, excluded: 'admin-session' });
      }
    }

    // Review mutations can change both compact and content payloads. Clear the
    // current isolate immediately; other isolates naturally expire within 15 seconds.
    if (request.method !== 'GET' && url.pathname.startsWith('/api/admin/')) {
      publicDataCache.clear();
    }

    const cacheKey = publicDataCacheKey(request, url);
    if (cacheKey) return cachedPublicData(request, runtime, ctx, cacheKey);

    return worker.fetch(request, runtime, ctx);
  }
};
