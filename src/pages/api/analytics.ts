import { isSameOriginWrite } from '../../lib/http/origin';
import type { APIRoute } from 'astro';
import { recordAnalyticsEvent, recordPageView } from '../../lib/data/analytics';

export const prerender = false;

const VISITOR_COOKIE = 'mrp_visitor';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365;
const PAGE_TYPES = new Set(['home', 'review', 'cine-cafe', 'other']);
const EVENT_TYPES = new Set(['social_follow_click', 'review_share_click']);
const PLATFORMS = new Set(['instagram', 'facebook', 'x', 'whatsapp', 'copy', 'more']);

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginWrite(request)) {
    return Response.json({ error: 'Cross-origin request rejected.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    pageType?: unknown;
    pageKey?: unknown;
    reviewSlug?: unknown;
    trafficSource?: unknown;
    sourceDetail?: unknown;
    campaign?: unknown;
    landingPage?: unknown;
    eventType?: unknown;
    platform?: unknown;
  } | null;

  const pageType = typeof body?.pageType === 'string' && PAGE_TYPES.has(body.pageType) ? body.pageType : 'other';
  const pageKey = typeof body?.pageKey === 'string' ? body.pageKey.trim().slice(0, 220) : '';
  const reviewSlug = typeof body?.reviewSlug === 'string' ? body.reviewSlug.trim().slice(0, 180) : null;
  const trafficSource = typeof body?.trafficSource === 'string' ? body.trafficSource.trim().slice(0, 40) : 'direct';
  const sourceDetail = typeof body?.sourceDetail === 'string' ? body.sourceDetail.trim().slice(0, 120) : null;
  const campaign = typeof body?.campaign === 'string' ? body.campaign.trim().slice(0, 120) : null;
  const landingPage = typeof body?.landingPage === 'string' ? body.landingPage.trim().slice(0, 220) : pageKey;
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
    const eventType = typeof body?.eventType === 'string' && EVENT_TYPES.has(body.eventType) ? body.eventType : '';
    const platform = typeof body?.platform === 'string' && PLATFORMS.has(body.platform) ? body.platform : '';
    if (eventType && platform) {
      await recordAnalyticsEvent({ visitorKey, eventType, platform, pageType, pageKey, reviewSlug, trafficSource, campaign });
    } else {
      await recordPageView({
        visitorKey, pageType, pageKey, reviewSlug, trafficSource, sourceDetail, campaign, landingPage,
      });
    }
    return Response.json({ recorded: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('Failed to record first-party analytics', error);
    return Response.json({ recorded: false }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
};
