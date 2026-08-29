import baseWorker from './worker.js';

const COMMENT_DATA_KEY = '_system/comments-v1.json';
const MEDIA_MIGRATION_KEY = '_system/wordpress-media-migration-v1.json';
const SESSION_COOKIE = 'mrp_admin';
const EXPECTED_MEDIA_TOTAL = 137;
const LEGACY_MEDIA_ORIGIN = 'https://moviereviewbypoorna.wordpress.com';
const MAX_MIGRATION_IMAGE_BYTES = 15 * 1024 * 1024;

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

      if (url.pathname.startsWith('/api/admin/migration/media')) {
        if (!(await isAuthenticated(request, env))) return json({ error: 'Unauthorized.' }, 401);
        if (url.pathname === '/api/admin/migration/media/status' && request.method === 'GET') {
          return mediaMigrationStatus(env, request.url, url.searchParams.get('verify') === '1');
        }
        if (url.pathname === '/api/admin/migration/media/run' && request.method === 'POST') {
          return runMediaMigration(request, env);
        }
      }

      return baseWorker.fetch(request, env, ctx);
    } catch (error) {
      console.error('comments/media worker error', error);
      if (
        url.pathname.startsWith('/api/comments') ||
        url.pathname.startsWith('/api/admin/comments') ||
        url.pathname.startsWith('/api/admin/migration/media')
      ) {
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

async function loadMediaMigrationCatalog(env, requestUrl) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  const response = await env.ASSETS.fetch(new Request(new URL('/data/index.json', requestUrl)));
  if (!response.ok) throw new Error('Unable to load legacy media manifest');
  const raw = await response.json();
  if (!Array.isArray(raw)) throw new Error('Legacy media manifest is not an array');

  const publicBase = String(env.R2_PUBLIC_BASE || 'https://assets.moviereviewbypoorna.com').replace(/\/+$/, '');
  const seenIds = new Set();
  const seenSlugs = new Set();
  const catalog = raw.map(row => {
    const id = Number(row.i);
    const slug = String(row.s || '').trim();
    if (!Number.isFinite(id)) throw new Error('Legacy media manifest contains an invalid review id');
    if (!/^[A-Za-z0-9%._~-]+$/.test(slug) || slug.includes('..')) throw new Error(`Unsafe review slug in media manifest: ${slug || '?'}`);
    if (seenIds.has(id)) throw new Error(`Duplicate review id in media manifest: ${id}`);
    if (seenSlugs.has(slug)) throw new Error(`Duplicate review slug in media manifest: ${slug}`);
    seenIds.add(id);
    seenSlugs.add(slug);

    const sourceUrl = legacyMediaUrl(row.m || '');
    assertLegacyMediaUrl(sourceUrl);
    const targetKey = `reviews/${slug}/poster.jpg`;
    return {
      id,
      title: String(row.t || ''),
      slug,
      source_url: sourceUrl,
      target_key: targetKey,
      target_url: `${publicBase}/${targetKey}`
    };
  });

  if (catalog.length !== EXPECTED_MEDIA_TOTAL) {
    throw new Error(`Media manifest count changed: expected ${EXPECTED_MEDIA_TOTAL}, found ${catalog.length}`);
  }
  return catalog;
}

function legacyMediaUrl(src) {
  const value = String(src || '').trim();
  if (!value) throw new Error('Legacy media source is missing');
  if (/^https?:\/\//i.test(value)) return value;
  return `${LEGACY_MEDIA_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

function assertLegacyMediaUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid legacy media URL: ${value}`);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'moviereviewbypoorna.wordpress.com' ||
    !url.pathname.startsWith('/wp-content/uploads/')
  ) {
    throw new Error(`Blocked unexpected legacy media URL: ${value}`);
  }
}

async function loadMediaMigrationLedger(env) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  const obj = await env.REVIEW_ASSETS.get(MEDIA_MIGRATION_KEY);
  if (!obj) return { version: 1, expected_total: EXPECTED_MEDIA_TOTAL, entries: {} };
  try {
    const parsed = JSON.parse(await obj.text());
    return {
      version: 1,
      expected_total: EXPECTED_MEDIA_TOTAL,
      entries: parsed && typeof parsed.entries === 'object' && parsed.entries ? parsed.entries : {}
    };
  } catch {
    return { version: 1, expected_total: EXPECTED_MEDIA_TOTAL, entries: {} };
  }
}

async function saveMediaMigrationLedger(env, ledger) {
  await env.REVIEW_ASSETS.put(MEDIA_MIGRATION_KEY, JSON.stringify(ledger), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    customMetadata: { private: 'true', purpose: 'wordpress-media-migration-ledger' }
  });
}

function mediaMigrationSummary(catalog, ledger) {
  const counts = { pending: 0, copied: 0, verified: 0, failed: 0 };
  const items = catalog.map(item => {
    const entry = ledger.entries[String(item.id)] || {};
    const status = ['copied', 'verified', 'failed'].includes(entry.status) ? entry.status : 'pending';
    counts[status] += 1;
    return {
      id: item.id,
      slug: item.slug,
      status,
      target_url: item.target_url,
      byte_size: Number(entry.byte_size || 0),
      content_type: entry.content_type || '',
      verified_at: entry.verified_at || null,
      error: entry.error || null
    };
  });
  return {
    expected_total: EXPECTED_MEDIA_TOTAL,
    catalog_total: catalog.length,
    ...counts,
    completion_percent: Number(((counts.verified / catalog.length) * 100).toFixed(2)),
    ready_for_native_cutover: counts.verified === catalog.length && counts.failed === 0,
    items
  };
}

async function mediaMigrationStatus(env, requestUrl, verifyObjects = false) {
  const [catalog, ledger] = await Promise.all([
    loadMediaMigrationCatalog(env, requestUrl),
    loadMediaMigrationLedger(env)
  ]);

  if (verifyObjects) {
    let changed = false;
    for (const item of catalog) {
      const entry = ledger.entries[String(item.id)];
      if (!entry || (entry.status !== 'verified' && entry.status !== 'copied')) continue;
      const object = await env.REVIEW_ASSETS.head(item.target_key);
      const expectedSize = Number(entry.byte_size || 0);
      if (!object || !object.size || (expectedSize > 0 && object.size !== expectedSize)) {
        ledger.entries[String(item.id)] = {
          ...entry,
          status: 'failed',
          error: 'R2 verification failed: object missing or byte size changed',
          checked_at: new Date().toISOString()
        };
        changed = true;
      } else if (entry.status !== 'verified') {
        ledger.entries[String(item.id)] = {
          ...entry,
          status: 'verified',
          error: null,
          verified_at: new Date().toISOString()
        };
        changed = true;
      }
    }
    if (changed) await saveMediaMigrationLedger(env, ledger);
  }

  return json(mediaMigrationSummary(catalog, ledger));
}

async function runMediaMigration(request, env) {
  if (!env.REVIEW_ASSETS) return json({ error: 'R2 binding is not configured.' }, 503);
  const input = await request.json().catch(() => ({}));
  const force = Boolean(input.force);
  const requestedIds = Array.isArray(input.ids)
    ? [...new Set(input.ids.map(Number).filter(Number.isFinite))].slice(0, 25)
    : [];
  const requestedLimit = Number(input.limit || 5);
  const limit = Math.max(1, Math.min(10, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 5));

  const [catalog, ledger] = await Promise.all([
    loadMediaMigrationCatalog(env, request.url),
    loadMediaMigrationLedger(env)
  ]);
  const byId = new Map(catalog.map(item => [item.id, item]));
  if (requestedIds.some(id => !byId.has(id))) return json({ error: 'One or more requested review IDs are not in the migration manifest.' }, 400);

  let selected;
  if (requestedIds.length) {
    selected = requestedIds.map(id => byId.get(id)).slice(0, limit);
  } else {
    selected = catalog.filter(item => {
      const status = ledger.entries[String(item.id)]?.status;
      return force || status !== 'verified';
    }).slice(0, limit);
  }

  const results = [];
  for (const item of selected) {
    const key = String(item.id);
    const previous = ledger.entries[key] || {};
    try {
      if (!force && (previous.status === 'verified' || previous.status === 'copied')) {
        const existing = await env.REVIEW_ASSETS.head(item.target_key);
        const expectedSize = Number(previous.byte_size || 0);
        if (existing && existing.size > 0 && (!expectedSize || existing.size === expectedSize)) {
          ledger.entries[key] = {
            ...previous,
            status: 'verified',
            error: null,
            verified_at: previous.verified_at || new Date().toISOString()
          };
          await saveMediaMigrationLedger(env, ledger);
          results.push({ id: item.id, slug: item.slug, status: 'verified', skipped: true, byte_size: existing.size });
          continue;
        }
      }

      assertLegacyMediaUrl(item.source_url);
      const source = await fetch(item.source_url, {
        redirect: 'follow',
        headers: { 'user-agent': 'MovieReviewByPoorna-MediaMigration/1.0' }
      });
      if (!source.ok) throw new Error(`WordPress fetch failed with HTTP ${source.status}`);
      const contentType = String(source.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!contentType.startsWith('image/')) throw new Error(`Unexpected source content type: ${contentType || 'missing'}`);
      const advertisedSize = Number(source.headers.get('content-length') || 0);
      if (advertisedSize > MAX_MIGRATION_IMAGE_BYTES) throw new Error('Source image exceeds the 15 MB migration limit');

      const bytes = await source.arrayBuffer();
      if (!bytes.byteLength) throw new Error('Source image is empty');
      if (bytes.byteLength > MAX_MIGRATION_IMAGE_BYTES) throw new Error('Source image exceeds the 15 MB migration limit');
      const migratedAt = new Date().toISOString();

      await env.REVIEW_ASSETS.put(item.target_key, bytes, {
        httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
        customMetadata: {
          sourceUrl: item.source_url,
          reviewId: String(item.id),
          migratedAt,
          migration: 'wordpress-r2-v1'
        }
      });

      ledger.entries[key] = {
        id: item.id,
        slug: item.slug,
        source_url: item.source_url,
        target_key: item.target_key,
        target_url: item.target_url,
        status: 'copied',
        content_type: contentType,
        byte_size: bytes.byteLength,
        migrated_at: migratedAt,
        verified_at: null,
        error: null
      };
      await saveMediaMigrationLedger(env, ledger);

      const verify = await env.REVIEW_ASSETS.get(item.target_key);
      if (!verify || verify.size !== bytes.byteLength) {
        try { await env.REVIEW_ASSETS.delete(item.target_key); } catch {}
        throw new Error('R2 read-back verification failed');
      }

      const verifiedAt = new Date().toISOString();
      ledger.entries[key] = {
        ...ledger.entries[key],
        status: 'verified',
        verified_at: verifiedAt,
        error: null
      };
      await saveMediaMigrationLedger(env, ledger);
      results.push({
        id: item.id,
        slug: item.slug,
        status: 'verified',
        skipped: false,
        byte_size: bytes.byteLength,
        content_type: contentType,
        target_url: item.target_url
      });
    } catch (error) {
      const message = cleanText(error?.message || String(error), 300) || 'Unknown migration failure';
      ledger.entries[key] = {
        ...previous,
        id: item.id,
        slug: item.slug,
        source_url: item.source_url,
        target_key: item.target_key,
        target_url: item.target_url,
        status: 'failed',
        error: message,
        failed_at: new Date().toISOString()
      };
      await saveMediaMigrationLedger(env, ledger);
      results.push({ id: item.id, slug: item.slug, status: 'failed', error: message });
    }
  }

  return json({ processed: results.length, results, summary: mediaMigrationSummary(catalog, ledger) });
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
