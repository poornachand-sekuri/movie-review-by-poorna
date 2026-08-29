const DATA_KEY = '_system/review-admin-v1.json';
const SESSION_COOKIE = 'mrp_admin';
const SESSION_TTL = 60 * 60 * 12;
const WP_POSTS = 'https://public-api.wordpress.com/rest/v1.1/sites/moviereviewbypoorna.wordpress.com/posts/';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/admin') return Response.redirect(new URL('/admin/', url), 302);
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error('worker error', error);
      if (url.pathname.startsWith('/api/')) return json({ error: 'Unexpected server error.' }, 500);
      return env.ASSETS.fetch(request);
    }
  }
};

async function handleApi(request, env, url) {
  if (url.pathname === '/api/reviews' && request.method === 'GET') {
    const reviews = await combinedReviews(env, request.url);
    return json(reviews.map(publicCompact));
  }
  if (url.pathname.startsWith('/api/reviews/') && request.method === 'GET') {
    const slug = decodeURIComponent(url.pathname.slice('/api/reviews/'.length)).replace(/\/+$/, '');
    const reviews = await combinedReviews(env, request.url);
    const review = reviews.find(r => r.s === slug);
    if (!review) return json({ error: 'Review not found.' }, 404);
    return json(publicFull(review));
  }

  if (url.pathname === '/api/admin/login' && request.method === 'POST') return login(request, env);
  if (url.pathname === '/api/admin/logout' && request.method === 'POST') return logout();
  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    const ok = await isAuthenticated(request, env);
    return ok ? json({ authenticated: true }) : json({ authenticated: false }, 401);
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!(await isAuthenticated(request, env))) return json({ error: 'Unauthorized.' }, 401);

    if (url.pathname === '/api/admin/reviews' && request.method === 'GET') {
      const reviews = await combinedReviews(env, request.url, true);
      return json(reviews.map(adminSummary));
    }
    if (url.pathname === '/api/admin/reviews' && request.method === 'POST') {
      return createReview(request, env);
    }
    if (/^\/api\/admin\/reviews\/\d+$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/').pop());
      if (request.method === 'GET') return getAdminReview(id, env, request.url);
      if (request.method === 'PUT') return updateReview(id, request, env);
      if (request.method === 'DELETE') return deleteReview(id, env, request.url);
    }
    if (url.pathname === '/api/admin/upload' && request.method === 'POST') return uploadImage(request, env);
  }

  return json({ error: 'Not found.' }, 404);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }
  });
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: 'Admin security is not configured yet. Add ADMIN_PASSWORD and ADMIN_SESSION_SECRET as Cloudflare Worker secrets.' }, 503);
  }
  const body = await request.json().catch(() => ({}));
  const supplied = String(body.password || '');
  if (!(await secureEqual(supplied, String(env.ADMIN_PASSWORD)))) return json({ error: 'Incorrect password.' }, 401);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const sig = await signSession(exp, env.ADMIN_SESSION_SECRET);
  const cookie = `${SESSION_COOKIE}=${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;
  return json({ authenticated: true }, 200, { 'set-cookie': cookie });
}

function logout() {
  return json({ authenticated: false }, 200, {
    'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  });
}

async function isAuthenticated(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const cookies = Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const i = v.indexOf('='); return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
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
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function secureEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0; for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

async function baseReviews(env, requestUrl) {
  const res = await env.ASSETS.fetch(new Request(new URL('/data/index.json', requestUrl)));
  if (!res.ok) throw new Error('Unable to read base review index');
  const raw = await res.json();
  return raw.map(normalizeBase);
}

function normalizeBase(q) {
  return {
    i: Number(q.i), t: q.t || '', s: q.s || slugify(q.t || ''), d: q.d || '', l: q.l || '', m: absoluteLegacyImage(q.m || ''),
    c: q.c ?? 0, e: q.e || '', rd: q.rd || '', r: q.r ?? null, v: q.v || '', body: q.body || '', gallery: Array.isArray(q.gallery) ? q.gallery : [],
    managed: false, updated_at: null
  };
}

function absoluteLegacyImage(src) {
  if (!src) return '';
  return /^https?:\/\//i.test(src) ? src : `https://moviereviewbypoorna.wordpress.com${src.startsWith('/') ? '' : '/'}${src}`;
}

async function loadStore(env) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  const obj = await env.REVIEW_ASSETS.get(DATA_KEY);
  if (!obj) return { version: 1, records: {}, deleted: [] };
  try {
    const parsed = JSON.parse(await obj.text());
    return { version: 1, records: parsed.records || {}, deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [] };
  } catch {
    return { version: 1, records: {}, deleted: [] };
  }
}

async function saveStore(env, store) {
  await env.REVIEW_ASSETS.put(DATA_KEY, JSON.stringify(store), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    customMetadata: { private: 'true', purpose: 'review-admin-data' }
  });
}

async function combinedReviews(env, requestUrl, includeManaged = false) {
  const [base, store] = await Promise.all([baseReviews(env, requestUrl), loadStore(env)]);
  const map = new Map(base.map(r => [Number(r.i), r]));
  for (const record of Object.values(store.records || {})) {
    const normalized = normalizeManaged(record);
    map.set(Number(normalized.i), normalized);
  }
  const deleted = new Set((store.deleted || []).map(Number));
  const out = [...map.values()].filter(r => !deleted.has(Number(r.i)));
  out.sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')) || Number(b.i) - Number(a.i));
  if (!includeManaged) return out;
  return out.map(r => ({ ...r, managed: Boolean(store.records?.[String(r.i)]) }));
}

function normalizeManaged(r) {
  return {
    i: Number(r.i), t: r.t || '', s: r.s || slugify(r.t || ''), d: r.d || '', l: r.l || '', m: r.m || '', c: r.c ?? 0,
    e: r.e || '', rd: r.rd || '', r: r.r === '' || r.r == null ? null : Number(r.r), v: r.v || '', body: r.body || '',
    gallery: Array.isArray(r.gallery) ? r.gallery : [], managed: true, updated_at: r.updated_at || null
  };
}

function publicCompact(r) {
  return { i: r.i, t: r.t, s: r.s, d: r.d, l: r.l, m: r.m, c: r.c ?? 0, e: r.e || '', rd: r.rd || '', r: r.r ?? null, v: r.v || '' };
}
function publicFull(r) {
  return { ...publicCompact(r), body: r.body || '', gallery: r.gallery || [], managed: Boolean(r.managed) };
}
function adminSummary(r) {
  return { ...publicCompact(r), managed: Boolean(r.managed), updated_at: r.updated_at || null };
}

async function getAdminReview(id, env, requestUrl) {
  const reviews = await combinedReviews(env, requestUrl, true);
  const review = reviews.find(r => Number(r.i) === Number(id));
  if (!review) return json({ error: 'Review not found.' }, 404);
  let body = review.body || '';
  if (!body) {
    try {
      const res = await fetch(`${WP_POSTS}${id}?context=display`);
      if (res.ok) body = (await res.json()).content || '';
    } catch {}
  }
  return json({ ...review, body, gallery: review.gallery || [] });
}

async function createReview(request, env) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'Invalid JSON.' }, 400);
  const [base, store] = await Promise.all([baseReviews(env, request.url), loadStore(env)]);
  const ids = [...base.map(r => Number(r.i)), ...Object.keys(store.records || {}).map(Number)].filter(Number.isFinite);
  const id = Math.max(1000, ...ids) + 1;
  const record = validateReview({ ...input, i: id });
  if (record.error) return json({ error: record.error }, 400);
  const combined = await combinedReviews(env, request.url, true);
  if (combined.some(r => r.s === record.value.s)) return json({ error: 'That slug is already in use.' }, 409);
  store.records[String(id)] = record.value;
  store.deleted = (store.deleted || []).filter(x => Number(x) !== id);
  await saveStore(env, store);
  return json({ review: publicFull(record.value) }, 201);
}

async function updateReview(id, request, env) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'Invalid JSON.' }, 400);
  const reviews = await combinedReviews(env, request.url, true);
  const current = reviews.find(r => Number(r.i) === Number(id));
  if (!current) return json({ error: 'Review not found.' }, 404);
  const record = validateReview({ ...current, ...input, i: id });
  if (record.error) return json({ error: record.error }, 400);
  if (reviews.some(r => Number(r.i) !== Number(id) && r.s === record.value.s)) return json({ error: 'That slug is already in use.' }, 409);
  const store = await loadStore(env);
  store.records[String(id)] = record.value;
  store.deleted = (store.deleted || []).filter(x => Number(x) !== Number(id));
  await saveStore(env, store);
  return json({ review: publicFull(record.value) });
}

async function deleteReview(id, env, requestUrl) {
  const reviews = await combinedReviews(env, requestUrl, true);
  const current = reviews.find(r => Number(r.i) === Number(id));
  if (!current) return json({ error: 'Review not found.' }, 404);
  const store = await loadStore(env);
  delete store.records[String(id)];
  if (!store.deleted.includes(Number(id))) store.deleted.push(Number(id));
  await saveStore(env, store);
  return json({ deleted: true, id });
}

function validateReview(input) {
  const title = String(input.t || input.title || '').trim();
  if (!title) return { error: 'Movie title is required.' };
  const slug = slugify(String(input.s || input.slug || title));
  if (!slug) return { error: 'A valid slug is required.' };
  const date = String(input.d || input.publish_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Publish date must be YYYY-MM-DD.' };
  const ratingRaw = input.r ?? input.rating;
  const rating = ratingRaw === '' || ratingRaw == null ? null : Number(ratingRaw);
  if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) return { error: 'Rating must be between 0 and 5.' };
  const record = {
    i: Number(input.i), t: title, s: slug, d: date, l: String(input.l || input.language || '').trim() || 'To be added',
    m: String(input.m || input.poster || '').trim(), c: Number.isFinite(Number(input.c)) ? Number(input.c) : 0,
    e: String(input.e || input.excerpt || '').trim(), rd: String(input.rd || input.release_date || '').trim(), r: rating,
    v: String(input.v || input.popcorn_verdict || '').trim(), body: sanitizeHtml(String(input.body || '')),
    gallery: (Array.isArray(input.gallery) ? input.gallery : []).map(String).filter(Boolean).slice(0, 20),
    managed: true, updated_at: new Date().toISOString()
  };
  if (!record.e && record.body) record.e = stripHtml(record.body).slice(0, 320);
  if (!record.v && record.e) record.v = record.e.split(/(?<=[.!?])\s+/)[0].slice(0, 180);
  return { value: record };
}

function sanitizeHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}
function stripHtml(html) { return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
function slugify(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100); }

async function uploadImage(request, env) {
  if (!env.REVIEW_ASSETS) return json({ error: 'R2 binding is not configured.' }, 503);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Expected multipart form data.' }, 400);
  const file = form.get('file');
  const slug = slugify(String(form.get('slug') || 'review')) || 'review';
  if (!(file instanceof File)) return json({ error: 'Image file is required.' }, 400);
  if (!String(file.type || '').startsWith('image/')) return json({ error: 'Only image uploads are allowed.' }, 415);
  if (file.size > 15 * 1024 * 1024) return json({ error: 'Image must be 15 MB or smaller.' }, 413);
  const ext = safeExtension(file.name, file.type);
  const key = `reviews/${slug}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await env.REVIEW_ASSETS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || `image/${ext}`, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { originalName: file.name || '', uploadedBy: 'admin' }
  });
  const base = String(env.R2_PUBLIC_BASE || 'https://assets.moviereviewbypoorna.com').replace(/\/+$/, '');
  return json({ url: `${base}/${key}`, key, size: file.size, type: file.type });
}
function safeExtension(name, type) {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (m && /^(jpe?g|png|webp|avif|gif)$/.test(m[1])) return m[1] === 'jpeg' ? 'jpg' : m[1];
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };
  return map[type] || 'jpg';
}
