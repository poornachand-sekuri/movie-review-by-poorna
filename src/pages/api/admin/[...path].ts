import { isSameOriginWrite } from '../../../lib/http/origin';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import {
  archiveAdminReview,
  createAdminReview,
  getAdminReview,
  listAdminReviews,
  updateAdminReview,
  type AdminReviewInput,
} from '../../../lib/data/admin-reviews';
import { adminReactionSyncWindow, getAdminAnalytics } from '../../../lib/data/analytics';
import { listAdminComments, moderateAdminComment } from '../../../lib/data/admin-comments';
import { clean, slugify } from '../../../lib/admin/values';
import { jsonResponse } from '../../../lib/http/json';
import {
  isAdminAuthenticated,
  loginAdmin,
  logoutAdmin,
} from '../../../lib/admin/auth';

export const prerender = false;

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const R2_PUBLIC_BASE = 'https://assets.moviereviewbypoorna.com';

interface AdminBindings {
  REVIEW_ASSETS?: R2Bucket;
}

function bindings(): AdminBindings {
  return env as unknown as AdminBindings;
}

function json(payload: unknown, status = 200): Response {
  return jsonResponse(payload, { status });
}

function safeImageExtension(name: string, type: string): string | null {
  const match = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  if (match && /^(jpe?g|png|webp|avif|gif)$/.test(match[1] ?? '')) {
    return match[1] === 'jpeg' ? 'jpg' : (match[1] ?? null);
  }
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/gif': 'gif',
  };
  return byType[type] ?? null;
}

async function uploadMedia(request: Request): Promise<Response> {
  const bucket = bindings().REVIEW_ASSETS;
  if (!bucket) return json({ error: 'R2 image storage is not configured.' }, 503);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: 'Expected multipart form data.' }, 400);

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Image file is required.' }, 400);
  if (!file.type.startsWith('image/')) return json({ error: 'Only image files are allowed.' }, 415);
  if (!file.size || file.size > MAX_IMAGE_BYTES) return json({ error: 'Image must be 15 MB or smaller.' }, 413);

  const extension = safeImageExtension(file.name, file.type);
  if (!extension) return json({ error: 'Unsupported image format.' }, 415);

  const slug = slugify(form.get('slug') || 'review') || 'review';
  const kind = clean(form.get('kind'), 20) === 'poster' ? 'poster' : 'gallery';
  const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const key = kind === 'poster'
    ? `reviews/${slug}/poster-${suffix}.${extension}`
    : `reviews/${slug}/gallery/${suffix}.${extension}`;

  await bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || `image/${extension}`,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: {
      originalName: clean(file.name, 200),
      uploadedBy: 'projector-room',
      reviewSlug: slug,
      kind,
    },
  });

  return json({
    key,
    url: `${R2_PUBLIC_BASE}/${key}`,
    size: file.size,
    type: file.type,
    kind,
  }, 201);
}

function keyFromMediaInput(body: unknown): string | null {
  const input = body && typeof body === 'object' ? body as { key?: unknown; url?: unknown } : {};
  let key = clean(input.key, 500);
  if (!key && input.url) {
    const url = clean(input.url, 1200);
    const prefix = `${R2_PUBLIC_BASE}/`;
    if (url.startsWith(prefix)) key = decodeURIComponent(url.slice(prefix.length));
  }

  if (!key || key.includes('..') || !/^reviews\/[a-z0-9._~-]+\//i.test(key) || key.startsWith('_system/')) {
    return null;
  }
  return key;
}

async function deleteMedia(request: Request): Promise<Response> {
  const bucket = bindings().REVIEW_ASSETS;
  if (!bucket) return json({ error: 'R2 image storage is not configured.' }, 503);
  const body = await request.json().catch(() => null);
  const key = keyFromMediaInput(body);
  if (!key) return json({ error: 'Only review images in movie-review-assets can be deleted.' }, 400);
  await bucket.delete(key);
  return json({ deleted: true, key });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/api/admin/login' && request.method === 'POST') {
    if (!isSameOriginWrite(request)) return json({ error: 'Cross-origin request rejected.' }, 403);
    return loginAdmin(request);
  }
  if (pathname === '/api/admin/logout' && request.method === 'POST') return logoutAdmin();
  if (pathname === '/api/admin/session' && request.method === 'GET') {
    return (await isAdminAuthenticated(request))
      ? json({ authenticated: true })
      : json({ authenticated: false }, 401);
  }

  if (!(await isAdminAuthenticated(request))) return json({ error: 'Unauthorized.' }, 401);
  if (!['GET', 'HEAD'].includes(request.method) && !isSameOriginWrite(request)) {
    return json({ error: 'Cross-origin request rejected.' }, 403);
  }

  try {
    if (pathname === '/api/admin/analytics' && request.method === 'GET') {
      return json(await getAdminAnalytics(Number(url.searchParams.get('days') || 30)));
    }

    if (pathname === '/api/admin/reactions/sync' && request.method === 'POST') {
      return json(await adminReactionSyncWindow(
        Number(url.searchParams.get('cursor') || 0),
        Number(url.searchParams.get('limit') || 20),
      ));
    }

    if (pathname === '/api/admin/comments' && request.method === 'GET') {
      return json(await listAdminComments({
        status: url.searchParams.get('status') ?? 'pending',
        target: url.searchParams.get('target') ?? '',
        limit: Number(url.searchParams.get('limit') || 200),
      }));
    }

    const commentMatch = pathname.match(/^\/api\/admin\/comments\/(\d+)$/);
    if (commentMatch && request.method === 'POST') {
      const commentId = Number(commentMatch[1]);
      const body = await request.json().catch(() => null) as { action?: unknown } | null;
      const action = clean(body?.action, 20).toLowerCase();
      const updated = await moderateAdminComment(commentId, action);
      if (!updated) return json({ error: 'Comment or moderation action not found.' }, 404);
      return json({ updated: true, id: commentId, action });
    }

    if (pathname === '/api/admin/reviews' && request.method === 'GET') {
      return json(await listAdminReviews(url.searchParams.get('compact') === '1'));
    }
    if (pathname === '/api/admin/reviews' && request.method === 'POST') {
      const input = await request.json().catch(() => null) as AdminReviewInput | null;
      if (!input) return json({ error: 'Invalid JSON body.' }, 400);
      const review = await createAdminReview(input);
      return json({ review }, 201);
    }

    const reviewMatch = pathname.match(/^\/api\/admin\/reviews\/(\d+)$/);
    if (reviewMatch) {
      const reviewId = Number(reviewMatch[1]);
      if (request.method === 'GET') {
        const review = await getAdminReview(reviewId);
        return review ? json(review) : json({ error: 'Review not found.' }, 404);
      }
      if (request.method === 'PUT') {
        const input = await request.json().catch(() => null) as AdminReviewInput | null;
        if (!input) return json({ error: 'Invalid JSON body.' }, 400);
        const review = await updateAdminReview(reviewId, input);
        return review ? json({ review }) : json({ error: 'Review not found.' }, 404);
      }
      if (request.method === 'DELETE') {
        const archived = await archiveAdminReview(reviewId);
        return archived ? json({ deleted: true, id: reviewId }) : json({ error: 'Review not found.' }, 404);
      }
    }

    if (pathname === '/api/admin/media' && request.method === 'POST') return uploadMedia(request);
    if (pathname === '/api/admin/media' && request.method === 'DELETE') return deleteMedia(request);

    return json({ error: 'Admin endpoint not found.' }, 404);
  } catch (error) {
    console.error('Projector Room admin API failed', error);
    const message = error instanceof Error ? error.message : 'Admin request failed.';
    const status = /required|valid|between|already in use|date/i.test(message) ? 400 : 500;
    return json({ error: message }, status);
  }
}

export const GET: APIRoute = ({ request }) => handle(request);
export const POST: APIRoute = ({ request }) => handle(request);
export const PUT: APIRoute = ({ request }) => handle(request);
export const DELETE: APIRoute = ({ request }) => handle(request);
