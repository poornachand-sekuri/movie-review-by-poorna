import { isSameOriginWrite } from '../../lib/http/origin';
import type { APIRoute } from 'astro';
import { recordPageView } from '../../lib/data/analytics';

export const prerender = false;

const VISITOR_COOKIE = 'mrp_visitor';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
const PAGE_TYPES = new Set(['home', 'review', 'cine-cafe', 'other']);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginWrite(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    pageType?: unknown;
    pageKey?: unknown;
    reviewSlug?: unknown;
  } | null;

  const pageType = typeof body?.pageType === 'string' && PAGE_TYPES.has(body.pageType)
    ? body.pageType
    : 'other';
  const pageKey = typeof body?.pageKey === 'string' ? body.pageKey.trim().slice(0, 220) : '';
  const reviewSlug = typeof body?.reviewSlug === 'string' ? body.reviewSlug.trim().slice(0, 180) : null;
  if (!pageKey) return Response.json({ error: 'Page key is required.' }, { status: 400 });

  let visitorKey = cookies.get(VISITOR_COOKIE)?.value?.trim() ?? '';
  if (!visitorKey) {
    visitorKey = crypto.randomUUID();
    cookies.set(VISITOR_COOKIE, visitorKey, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: VISITOR_MAX_AGE,
    });
  }

  try {
    await recordPageView({ visitorKey, pageType, pageKey, reviewSlug });
    return Response.json({ recorded: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Failed to record first-party page view', error);
    return Response.json({ recorded: false }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
};
