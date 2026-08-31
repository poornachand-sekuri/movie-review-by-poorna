const REVIEW_DATA_KEY = '_system/review-admin-v2.json';
const SESSION_COOKIE = 'mrp_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const R2_DEFAULT_BASE = 'https://assets.moviereviewbypoorna.com';
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const CAST_FIELDS = ['actors', 'actresses', 'directors', 'music_directors'];

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

function clean(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function sameOriginWrite(request, url) {
  const origin = request.headers.get('origin');
  return !origin || origin === url.origin;
}

async function secureEqual(a, b) {
  const aa = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function base64url(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signSession(exp, nonce, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`admin:${exp}:${nonce}`)
  );
  return base64url(new Uint8Array(bytes));
}

export async function adminIsAuthenticated(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;
  const [expText, nonce, signature] = token.split('.');
  const exp = Number(expText);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000) || !nonce || !signature) return false;
  const expected = await signSession(exp, nonce, String(env.ADMIN_SESSION_SECRET));
  return secureEqual(signature, expected);
}

async function login(request, env) {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({
      error: 'Admin security is not configured. Add ADMIN_PASSWORD and ADMIN_SESSION_SECRET as Cloudflare Worker secrets.'
    }, 503);
  }
  const body = await request.json().catch(() => ({}));
  if (!(await secureEqual(String(body.password || ''), String(env.ADMIN_PASSWORD)))) {
    return json({ error: 'Incorrect password.' }, 401);
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const signature = await signSession(exp, nonce, String(env.ADMIN_SESSION_SECRET));
  const cookie = `${SESSION_COOKIE}=${exp}.${nonce}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
  return json({ authenticated: true }, 200, { 'set-cookie': cookie });
}

function logout() {
  return json({ authenticated: false }, 200, {
    'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  });
}

function normalizeBaseReview(row) {
  return {
    i: Number(row.i),
    t: row.t || '',
    s: row.s || slugify(row.t),
    d: row.d || '',
    l: row.l || '',
    m: row.m || '',
    c: Number(row.c) || 0,
    e: row.e || '',
    rd: row.rd || '',
    r: row.r === '' || row.r == null ? null : Number(row.r),
    v: row.v || '',
    body: row.body || '',
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    managed: false,
    updated_at: null,
    base_slug: row.s || slugify(row.t)
  };
}

function normalizeManagedReview(row) {
  return {
    i: Number(row.i),
    t: row.t || '',
    s: row.s || slugify(row.t),
    d: row.d || '',
    l: row.l || '',
    m: row.m || '',
    c: Number(row.c) || 0,
    e: row.e || '',
    rd: row.rd || '',
    r: row.r === '' || row.r == null ? null : Number(row.r),
    v: row.v || '',
    body: row.body || '',
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    cast_crew: normalizeCast(row.cast_crew),
    managed: true,
    updated_at: row.updated_at || null,
    base_slug: row.base_slug || null
  };
}

function normalizeCast(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.fromEntries(CAST_FIELDS.map(field => [
    field,
    [...new Set((Array.isArray(source[field]) ? source[field] : [])
      .map(value => clean(value, 120))
      .filter(Boolean))].slice(0, 30)
  ]));
}

async function baseReviews(env, requestUrl) {
  const response = await env.ASSETS.fetch(new Request(new URL('/data/index.json', requestUrl)));
  if (!response.ok) throw new Error('Unable to load base review catalog');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Base review catalog is invalid');
  return rows.map(normalizeBaseReview);
}

async function baseCastCrew(env, requestUrl) {
  const response = await env.ASSETS.fetch(new Request(new URL('/data/cast-crew.json', requestUrl)));
  if (!response.ok) throw new Error('Unable to load base Cast & Crew data');
  const payload = await response.json();
  if (!payload || typeof payload.records !== 'object') throw new Error('Base Cast & Crew data is invalid');
  return payload;
}

async function loadReviewStore(env) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  const object = await env.REVIEW_ASSETS.get(REVIEW_DATA_KEY);
  if (!object) return { version: 2, records: {}, deleted: [] };
  try {
    const parsed = JSON.parse(await object.text());
    return {
      version: 2,
      records: parsed && typeof parsed.records === 'object' && parsed.records ? parsed.records : {},
      deleted: Array.isArray(parsed?.deleted) ? parsed.deleted.map(Number).filter(Number.isFinite) : []
    };
  } catch {
    return { version: 2, records: {}, deleted: [] };
  }
}

async function saveReviewStore(env, store) {
  if (!env.REVIEW_ASSETS) throw new Error('R2 binding REVIEW_ASSETS is not configured');
  await env.REVIEW_ASSETS.put(REVIEW_DATA_KEY, JSON.stringify({
    version: 2,
    records: store.records || {},
    deleted: store.deleted || []
  }), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' },
    customMetadata: { private: 'true', purpose: 'review-admin-data-v2' }
  });
}

export async function getCombinedReviews(env, requestUrl, includeAdminMeta = false) {
  const [base, store] = await Promise.all([baseReviews(env, requestUrl), loadReviewStore(env)]);
  const map = new Map(base.map(review => [Number(review.i), review]));
  for (const record of Object.values(store.records || {})) {
    const review = normalizeManagedReview(record);
    map.set(Number(review.i), review);
  }
  const deleted = new Set((store.deleted || []).map(Number));
  const reviews = [...map.values()].filter(review => !deleted.has(Number(review.i)));
  reviews.sort((a, b) => {
    const byDate = String(b.d || '').localeCompare(String(a.d || ''));
    return byDate || Number(b.i) - Number(a.i);
  });
  if (includeAdminMeta) return reviews;
  return reviews.map(publicFullReview);
}

export async function getCombinedCastCrew(env, requestUrl) {
  const [basePayload, baseReviewList, store] = await Promise.all([
    baseCastCrew(env, requestUrl),
    baseReviews(env, requestUrl),
    loadReviewStore(env)
  ]);
  const records = { ...basePayload.records };
  const baseById = new Map(baseReviewList.map(review => [Number(review.i), review]));
  const deleted = new Set((store.deleted || []).map(Number));

  for (const id of deleted) {
    const baseReview = baseById.get(Number(id));
    if (baseReview?.s) delete records[baseReview.s];
  }

  for (const raw of Object.values(store.records || {})) {
    const review = normalizeManagedReview(raw);
    const baseSlug = review.base_slug || baseById.get(Number(review.i))?.s || null;
    if (baseSlug && baseSlug !== review.s) delete records[baseSlug];
    const cast = normalizeCast(review.cast_crew);
    records[review.s] = CAST_FIELDS.map(field => cast[field]);
  }

  return {
    ...basePayload,
    generated_at: new Date().toISOString().slice(0, 10),
    records
  };
}

function publicCompactReview(review) {
  return {
    i: review.i,
    t: review.t,
    s: review.s,
    d: review.d,
    l: review.l,
    m: review.m,
    c: review.c || 0,
    e: review.e || '',
    rd: review.rd || '',
    r: review.r == null ? null : review.r,
    v: review.v || ''
  };
}

function publicFullReview(review) {
  return {
    ...publicCompactReview(review),
    body: review.body || '',
    gallery: Array.isArray(review.gallery) ? review.gallery : []
  };
}

function adminReview(review, castCrew = null) {
  return {
    ...publicFullReview(review),
    managed: Boolean(review.managed),
    updated_at: review.updated_at || null,
    cast_crew: normalizeCast(castCrew || review.cast_crew)
  };
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sanitizeHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function validateReview(input, { id, baseSlug = null } = {}) {
  const title = clean(input.t ?? input.title, 180);
  if (!title) return { error: 'Movie title is required.' };
  const slug = slugify(input.s ?? input.slug ?? title);
  if (!slug) return { error: 'A valid URL slug is required.' };
  const publishDate = clean(input.d ?? input.publish_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) return { error: 'Publish date must be YYYY-MM-DD.' };
  const releaseDate = clean(input.rd ?? input.release_date, 10);
  if (releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) return { error: 'Release date must be YYYY-MM-DD.' };
  const ratingRaw = input.r ?? input.rating;
  const rating = ratingRaw === '' || ratingRaw == null ? null : Number(ratingRaw);
  if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    return { error: 'Rating must be between 0 and 5.' };
  }
  const body = sanitizeHtml(input.body || '');
  let excerpt = clean(input.e ?? input.excerpt, 700);
  let verdict = clean(input.v ?? input.popcorn_verdict, 260);
  if (!excerpt && body) excerpt = stripHtml(body).slice(0, 700);
  if (!verdict && excerpt) verdict = excerpt.split(/(?<=[.!?])\s+/)[0].slice(0, 260);

  return {
    value: {
      i: Number(id),
      t: title,
      s: slug,
      d: publishDate,
      l: clean(input.l ?? input.language, 80) || 'To be added',
      m: clean(input.m ?? input.poster, 1000),
      c: Math.max(0, Number(input.c) || 0),
      e: excerpt,
      rd: releaseDate,
      r: rating,
      v: verdict,
      body,
      gallery: (Array.isArray(input.gallery) ? input.gallery : [])
        .map(value => clean(value, 1000))
        .filter(Boolean)
        .slice(0, 30),
      cast_crew: normalizeCast(input.cast_crew),
      base_slug: baseSlug,
      managed: true,
      updated_at: new Date().toISOString()
    }
  };
}

async function adminReviewList(env, requestUrl) {
  const reviews = await getCombinedReviews(env, requestUrl, true);
  return reviews.map(review => ({
    ...publicCompactReview(review),
    managed: Boolean(review.managed),
    updated_at: review.updated_at || null
  }));
}

async function getAdminReview(id, env, requestUrl) {
  const [reviews, castPayload] = await Promise.all([
    getCombinedReviews(env, requestUrl, true),
    getCombinedCastCrew(env, requestUrl)
  ]);
  const review = reviews.find(item => Number(item.i) === Number(id));
  if (!review) return json({ error: 'Review not found.' }, 404);
  const rawCast = castPayload.records?.[review.s] || [[], [], [], []];
  const cast = Object.fromEntries(CAST_FIELDS.map((field, index) => [field, rawCast[index] || []]));
  return json(adminReview(review, cast));
}

async function createReview(request, env) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'Invalid JSON body.' }, 400);
  const [base, store, current] = await Promise.all([
    baseReviews(env, request.url),
    loadReviewStore(env),
    getCombinedReviews(env, request.url, true)
  ]);
  const ids = [
    ...base.map(review => Number(review.i)),
    ...Object.keys(store.records || {}).map(Number)
  ].filter(Number.isFinite);
  const id = Math.max(1000, ...ids) + 1;
  const validated = validateReview(input, { id, baseSlug: null });
  if (validated.error) return json({ error: validated.error }, 400);
  if (current.some(review => review.s === validated.value.s)) return json({ error: 'That URL slug is already in use.' }, 409);
  store.records[String(id)] = validated.value;
  store.deleted = (store.deleted || []).filter(value => Number(value) !== id);
  await saveReviewStore(env, store);
  return json({ review: adminReview(validated.value, validated.value.cast_crew) }, 201);
}

async function updateReview(id, request, env) {
  const input = await request.json().catch(() => null);
  if (!input) return json({ error: 'Invalid JSON body.' }, 400);
  const [reviews, castPayload, store] = await Promise.all([
    getCombinedReviews(env, request.url, true),
    getCombinedCastCrew(env, request.url),
    loadReviewStore(env)
  ]);
  const current = reviews.find(review => Number(review.i) === Number(id));
  if (!current) return json({ error: 'Review not found.' }, 404);
  const rawCast = castPayload.records?.[current.s] || [[], [], [], []];
  const currentCast = Object.fromEntries(CAST_FIELDS.map((field, index) => [field, rawCast[index] || []]));
  const baseSlug = current.base_slug || (current.managed ? null : current.s) || null;
  const validated = validateReview({
    ...current,
    ...input,
    cast_crew: input.cast_crew || currentCast
  }, { id, baseSlug });
  if (validated.error) return json({ error: validated.error }, 400);
  if (reviews.some(review => Number(review.i) !== Number(id) && review.s === validated.value.s)) {
    return json({ error: 'That URL slug is already in use.' }, 409);
  }
  store.records[String(id)] = validated.value;
  store.deleted = (store.deleted || []).filter(value => Number(value) !== Number(id));
  await saveReviewStore(env, store);
  return json({ review: adminReview(validated.value, validated.value.cast_crew) });
}

async function deleteReview(id, env, requestUrl) {
  const reviews = await getCombinedReviews(env, requestUrl, true);
  const current = reviews.find(review => Number(review.i) === Number(id));
  if (!current) return json({ error: 'Review not found.' }, 404);
  const store = await loadReviewStore(env);
  delete store.records[String(id)];
  if (!(store.deleted || []).includes(Number(id))) store.deleted.push(Number(id));
  await saveReviewStore(env, store);
  return json({ deleted: true, id: Number(id), slug: current.s });
}

function safeImageExtension(name, type) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match && /^(jpe?g|png|webp|avif|gif)$/.test(match[1])) return match[1] === 'jpeg' ? 'jpg' : match[1];
  const byType = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif'
  };
  return byType[type] || null;
}

function r2PublicBase(env) {
  return String(env.R2_PUBLIC_BASE || R2_DEFAULT_BASE).replace(/\/+$/, '');
}

async function uploadImage(request, env) {
  if (!env.REVIEW_ASSETS) return json({ error: 'R2 image storage is not configured.' }, 503);
  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Expected multipart form data.' }, 400);
  const file = form.get('file');
  const slug = slugify(form.get('slug') || 'review') || 'review';
  const kind = clean(form.get('kind'), 20) === 'poster' ? 'poster' : 'gallery';
  if (!(file instanceof File)) return json({ error: 'Image file is required.' }, 400);
  if (!String(file.type || '').startsWith('image/')) return json({ error: 'Only image files are allowed.' }, 415);
  if (!file.size || file.size > MAX_IMAGE_BYTES) return json({ error: 'Image must be 15 MB or smaller.' }, 413);
  const ext = safeImageExtension(file.name, file.type);
  if (!ext) return json({ error: 'Unsupported image format.' }, 415);
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const key = kind === 'poster'
    ? `reviews/${slug}/poster-${suffix}.${ext}`
    : `reviews/${slug}/gallery/${suffix}.${ext}`;
  await env.REVIEW_ASSETS.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || `image/${ext}`,
      cacheControl: 'public, max-age=31536000, immutable'
    },
    customMetadata: {
      originalName: clean(file.name, 200),
      uploadedBy: 'admin-console-v2',
      reviewSlug: slug,
      kind
    }
  });
  return json({
    key,
    url: `${r2PublicBase(env)}/${key}`,
    size: file.size,
    type: file.type,
    kind
  }, 201);
}

function keyFromMediaInput(input, env) {
  let key = clean(input?.key, 500);
  if (!key && input?.url) {
    const base = `${r2PublicBase(env)}/`;
    const url = clean(input.url, 1200);
    if (url.startsWith(base)) key = decodeURIComponent(url.slice(base.length));
  }
  if (!key || key.includes('..') || !/^reviews\/[a-z0-9._~-]+\//i.test(key) || key.startsWith('_system/')) return null;
  return key;
}

async function deleteImage(request, env) {
  if (!env.REVIEW_ASSETS) return json({ error: 'R2 image storage is not configured.' }, 503);
  const body = await request.json().catch(() => ({}));
  const key = keyFromMediaInput(body, env);
  if (!key) return json({ error: 'Only review images in the configured R2 bucket can be deleted.' }, 400);
  await env.REVIEW_ASSETS.delete(key);
  return json({ deleted: true, key });
}

async function commentsAdminList(env, url) {
  const store = env.COMMENTS.getByName('global-comments');
  const listUrl = new URL('https://comments-store.internal/admin/list');
  for (const key of ['status', 'target', 'target_id', 'limit']) {
    const value = url.searchParams.get(key);
    if (value) listUrl.searchParams.set(key, value);
  }
  const [listResponse, countsResponse] = await Promise.all([
    store.fetch(listUrl, { method: 'GET' }),
    store.fetch('https://comments-store.internal/admin/counts', { method: 'GET' })
  ]);
  const list = await listResponse.json();
  const counts = await countsResponse.json();
  return json({ comments: list.comments || [], counts: counts.counts || {} });
}

async function moderateComment(id, action, env) {
  if (!['approve', 'reject', 'delete'].includes(action)) return json({ error: 'Invalid moderation action.' }, 400);
  const store = env.COMMENTS.getByName('global-comments');
  return store.fetch('https://comments-store.internal/admin/moderate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, action })
  });
}

async function analyticsSummary(env, url) {
  const analytics = env.ANALYTICS.getByName('global-analytics');
  const summaryUrl = new URL('https://analytics-store.internal/summary');
  summaryUrl.searchParams.set('days', url.searchParams.get('days') || '30');
  const [trafficResponse, countsResponse, reviews] = await Promise.all([
    analytics.fetch(summaryUrl, { method: 'GET' }),
    env.COMMENTS.getByName('global-comments').fetch('https://comments-store.internal/admin/counts', { method: 'GET' }),
    getCombinedReviews(env, url.toString(), true)
  ]);
  const traffic = await trafficResponse.json();
  const commentCounts = await countsResponse.json();
  const bySlug = new Map(reviews.map(review => [review.s, review]));
  return json({
    ...traffic,
    reviewCount: reviews.length,
    commentCounts: commentCounts.counts || {},
    reactions: (traffic.reactions || []).map(item => ({
      ...item,
      title: bySlug.get(item.slug)?.t || item.slug
    })),
    topPages: (traffic.topPages || []).map(item => ({
      ...item,
      title: item.title || (item.slug ? bySlug.get(item.slug)?.t : null) || item.pageKey
    }))
  });
}

async function syncReactionBatch(env, url) {
  const reviews = await getCombinedReviews(env, url.toString(), true);
  const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
  const limit = Math.max(1, Math.min(25, Number(url.searchParams.get('limit')) || 20));
  const batch = reviews.slice(cursor, cursor + limit);
  const analytics = env.ANALYTICS.getByName('global-analytics');

  await Promise.all(batch.map(async review => {
    const reactionStore = env.REACTIONS.getByName(review.s);
    const response = await reactionStore.fetch('https://reaction-store.internal/admin', { method: 'GET' });
    if (!response.ok) return;
    const snapshot = await response.json();
    await analytics.fetch('https://analytics-store.internal/reaction-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: review.s, like: snapshot.like, dislike: snapshot.dislike })
    });
  }));

  const nextCursor = cursor + batch.length;
  return json({
    synced: batch.length,
    cursor,
    nextCursor,
    total: reviews.length,
    done: nextCursor >= reviews.length
  });
}

export async function handleDynamicData(request, env, url) {
  if (request.method !== 'GET') return null;
  if (url.pathname === '/data/index.json') {
    const reviews = await getCombinedReviews(env, request.url, false);
    return json(reviews);
  }
  if (url.pathname === '/data/cast-crew.json') {
    return json(await getCombinedCastCrew(env, request.url));
  }
  return null;
}

export async function handleAdminApi(request, env, url) {
  if (url.pathname === '/api/admin/login' && request.method === 'POST') {
    if (!sameOriginWrite(request, url)) return json({ error: 'Cross-origin request rejected.' }, 403);
    return login(request, env);
  }
  if (url.pathname === '/api/admin/logout' && request.method === 'POST') return logout();
  if (url.pathname === '/api/admin/session' && request.method === 'GET') {
    return (await adminIsAuthenticated(request, env))
      ? json({ authenticated: true })
      : json({ authenticated: false }, 401);
  }

  if (!url.pathname.startsWith('/api/admin/')) return null;
  if (!(await adminIsAuthenticated(request, env))) {
    const legacyToken = String(env.ADMIN_COMMENTS_TOKEN || '');
    const auth = request.headers.get('authorization') || '';
    if (!legacyToken || auth !== `Bearer ${legacyToken}`) return json({ error: 'Unauthorized.' }, 401);
  }
  if (!['GET', 'HEAD'].includes(request.method) && !sameOriginWrite(request, url)) {
    return json({ error: 'Cross-origin request rejected.' }, 403);
  }

  if (url.pathname === '/api/admin/reviews' && request.method === 'GET') {
    return json(await adminReviewList(env, request.url));
  }
  if (url.pathname === '/api/admin/reviews' && request.method === 'POST') return createReview(request, env);

  const reviewMatch = url.pathname.match(/^\/api\/admin\/reviews\/(\d+)$/);
  if (reviewMatch) {
    const id = Number(reviewMatch[1]);
    if (request.method === 'GET') return getAdminReview(id, env, request.url);
    if (request.method === 'PUT') return updateReview(id, request, env);
    if (request.method === 'DELETE') return deleteReview(id, env, request.url);
  }

  if (url.pathname === '/api/admin/media' && request.method === 'POST') return uploadImage(request, env);
  if (url.pathname === '/api/admin/media' && request.method === 'DELETE') return deleteImage(request, env);

  if (url.pathname === '/api/admin/comments' && request.method === 'GET') return commentsAdminList(env, url);
  const commentMatch = url.pathname.match(/^\/api\/admin\/comments\/([^/]+)$/);
  if (commentMatch && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    return moderateComment(decodeURIComponent(commentMatch[1]), clean(body.action, 20).toLowerCase(), env);
  }

  if (url.pathname === '/api/admin/analytics' && request.method === 'GET') return analyticsSummary(env, url);
  if (url.pathname === '/api/admin/reactions/sync' && request.method === 'POST') return syncReactionBatch(env, url);

  return json({ error: 'Admin endpoint not found.' }, 404);
}
