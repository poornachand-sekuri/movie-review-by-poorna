import { ensureAllReactionImports } from './reactions';
import { getContentDb } from '../cloudflare/content-db';
import { clean } from '../admin/values';
import { getAdminCommentCounts } from './admin-comments';
import { ensureAnalyticsSchema } from './analytics-schema';

interface CountRow { count: number | null }
interface AnalyticsSnapshot {
  version: number;
  days: number;
  computedAt: number;
  expiresAt: number;
  value: Record<string, unknown>;
}
const analyticsCache = new WeakMap<D1Database, AnalyticsSnapshot>();

function normalized(value: unknown, max: number, fallback = ''): string {
  return clean(value, max).trim().toLowerCase() || fallback;
}

export async function recordPageView(input: {
  visitorKey: string;
  pageType: string;
  pageKey: string;
  reviewSlug?: string | null;
  trafficSource?: string | null;
  sourceDetail?: string | null;
  campaign?: string | null;
  landingPage?: string | null;
}): Promise<void> {
  await ensureAnalyticsSchema();
  const visitorKey = clean(input.visitorKey, 96);
  const pageType = clean(input.pageType, 40);
  const pageKey = clean(input.pageKey, 220);
  const reviewSlug = clean(input.reviewSlug, 180) || null;
  const trafficSource = normalized(input.trafficSource, 40, 'direct');
  const sourceDetail = clean(input.sourceDetail, 120) || null;
  const campaign = clean(input.campaign, 120) || null;
  const landingPage = clean(input.landingPage, 220) || pageKey;
  if (!visitorKey || !pageType || !pageKey) return;

  await getContentDb().prepare(`
    INSERT INTO page_views (
      visitor_key, page_type, page_key, review_slug,
      traffic_source, source_detail, campaign, landing_page, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
  `).bind(visitorKey, pageType, pageKey, reviewSlug, trafficSource, sourceDetail, campaign, landingPage).run();
}

export async function recordAnalyticsEvent(input: {
  visitorKey: string;
  eventType: string;
  platform: string;
  pageType: string;
  pageKey: string;
  reviewSlug?: string | null;
  trafficSource?: string | null;
  campaign?: string | null;
}): Promise<void> {
  await ensureAnalyticsSchema();
  const visitorKey = clean(input.visitorKey, 96);
  const eventType = clean(input.eventType, 40);
  const platform = normalized(input.platform, 40);
  const pageType = clean(input.pageType, 40);
  const pageKey = clean(input.pageKey, 220);
  const reviewSlug = clean(input.reviewSlug, 180) || null;
  const trafficSource = normalized(input.trafficSource, 40, 'direct');
  const campaign = clean(input.campaign, 120) || null;
  if (!visitorKey || !eventType || !platform || !pageType || !pageKey) return;

  await getContentDb().prepare(`
    INSERT INTO analytics_events (
      visitor_key, event_type, platform, page_type, page_key,
      review_slug, traffic_source, campaign, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
  `).bind(visitorKey, eventType, platform, pageType, pageKey, reviewSlug, trafficSource, campaign).run();
}

export async function getAdminAnalytics(days = 30): Promise<Record<string, unknown>> {
  await ensureAnalyticsSchema();
  const safeDays = Math.max(1, Math.min(365, Math.trunc(Number(days) || 30)));
  const db = getContentDb();
  const revision = await db.prepare('SELECT version FROM analytics_revision WHERE id = 1').first<{ version: number }>();
  if (!revision) throw new Error('Apply database migration 0008 before using dashboard analytics.');
  const now = Date.now();
  const cutoff = new Date(now - safeDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  const since = cutoff.slice(0, 10);
  const cached = analyticsCache.get(db);
  if (cached?.version === revision.version && cached.days === safeDays && now >= cached.computedAt && now < cached.expiresAt) {
    return { ...cached.value, since };
  }
  await ensureAllReactionImports();

  const [
    trafficRow, byTypeResult, dailyResult, topPagesResult, reactionResult, commentCounts,
    sourceResult, socialEventResult, landingResult, sourceReviewResult,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_key) AS visitors,
        unixepoch(MIN(created_at)) AS oldest_view
      FROM page_views WHERE created_at >= ?1`).bind(cutoff).first<{ views: number; visitors: number; oldest_view: number | null }>(),
    db.prepare(`SELECT page_type, COUNT(*) AS views FROM page_views WHERE created_at >= ?1 GROUP BY page_type ORDER BY views DESC, page_type`)
      .bind(cutoff).run<{ page_type: string; views: number }>(),
    db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS views FROM page_views WHERE created_at >= ?1 GROUP BY date(created_at) ORDER BY day ASC`)
      .bind(cutoff).run<{ day: string; views: number }>(),
    db.prepare(`
      WITH top_pages AS (
        SELECT page_key, page_type, review_slug, COUNT(*) AS views, COUNT(DISTINCT visitor_key) AS visitors
        FROM page_views WHERE created_at >= ?1
        GROUP BY page_key, page_type, review_slug ORDER BY views DESC, visitors DESC, page_key LIMIT 30
      )
      SELECT p.*, r.title FROM top_pages p LEFT JOIN reviews r ON r.slug COLLATE NOCASE = p.review_slug
      ORDER BY p.views DESC, p.visitors DESC, p.page_key
    `).bind(cutoff).run<{ page_key: string; page_type: string; review_slug: string | null; views: number; visitors: number; title: string | null }>(),
    db.prepare(`
      SELECT r.slug, r.title, COALESCE(t.likes, 0) AS likes, COALESCE(t.dislikes, 0) AS dislikes
      FROM reviews r LEFT JOIN review_reaction_totals t ON t.review_id = r.id
      WHERE r.status = 'published'
      ORDER BY (likes + dislikes) DESC, likes DESC, r.reviewed_date DESC, r.id DESC
    `).run<{ slug: string; title: string; likes: number; dislikes: number }>(),
    getAdminCommentCounts(),
    db.prepare(`
      SELECT COALESCE(NULLIF(traffic_source, ''), 'unknown') AS traffic_source,
        COUNT(*) AS views, COUNT(DISTINCT visitor_key) AS visitors
      FROM page_views WHERE created_at >= ?1
      GROUP BY traffic_source ORDER BY views DESC, visitors DESC, traffic_source
    `).bind(cutoff).run<{ traffic_source: string; views: number; visitors: number }>(),
    db.prepare(`
      SELECT event_type, platform, COUNT(*) AS clicks, COUNT(DISTINCT visitor_key) AS visitors
      FROM analytics_events WHERE created_at >= ?1
      GROUP BY event_type, platform ORDER BY clicks DESC, event_type, platform
    `).bind(cutoff).run<{ event_type: string; platform: string; clicks: number; visitors: number }>(),
    db.prepare(`
      WITH landing AS (
        SELECT COALESCE(NULLIF(traffic_source, ''), 'unknown') AS traffic_source, landing_page,
          COUNT(DISTINCT visitor_key) AS visitors
        FROM page_views
        WHERE created_at >= ?1 AND landing_page IS NOT NULL AND landing_page <> ''
        GROUP BY traffic_source, landing_page
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY traffic_source ORDER BY visitors DESC, landing_page) AS rank
        FROM landing
      )
      SELECT ranked.traffic_source, ranked.landing_page, ranked.visitors, r.title
      FROM ranked
      LEFT JOIN reviews r ON ranked.landing_page = '/review/' || r.slug
      WHERE ranked.rank <= 3
      ORDER BY ranked.traffic_source, ranked.rank
    `).bind(cutoff).run<{ traffic_source: string; landing_page: string; visitors: number; title: string | null }>(),
    db.prepare(`
      WITH review_source AS (
        SELECT COALESCE(NULLIF(p.traffic_source, ''), 'unknown') AS traffic_source, p.review_slug,
          COUNT(*) AS views, COUNT(DISTINCT p.visitor_key) AS visitors
        FROM page_views p
        WHERE p.created_at >= ?1 AND p.review_slug IS NOT NULL
        GROUP BY traffic_source, p.review_slug
      ), ranked AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY traffic_source ORDER BY views DESC, visitors DESC, review_slug) AS rank
        FROM review_source
      )
      SELECT ranked.traffic_source, ranked.review_slug, ranked.views, ranked.visitors, r.title
      FROM ranked LEFT JOIN reviews r ON r.slug COLLATE NOCASE = ranked.review_slug
      WHERE ranked.rank <= 3
      ORDER BY ranked.traffic_source, ranked.rank
    `).bind(cutoff).run<{ traffic_source: string; review_slug: string; views: number; visitors: number; title: string | null }>(),
  ]);

  const reactions = reactionResult.results.map((row) => ({
    slug: row.slug, title: row.title, like: Number(row.likes ?? 0), dislike: Number(row.dislikes ?? 0),
  }));
  const reactionTotals = reactions.reduce((totals, row) => ({ like: totals.like + row.like, dislike: totals.dislike + row.dislike }), { like: 0, dislike: 0 });
  const socialEvents = socialEventResult.results.map((row) => ({
    eventType: row.event_type, platform: row.platform, clicks: Number(row.clicks ?? 0), visitors: Number(row.visitors ?? 0),
  }));
  const socialEventTotals = socialEvents.reduce((totals, row) => {
    if (row.eventType === 'social_follow_click') totals.follow += row.clicks;
    if (row.eventType === 'review_share_click') totals.share += row.clicks;
    return totals;
  }, { follow: 0, share: 0 });

  const value = {
    days: safeDays,
    since,
    views: Number(trafficRow?.views ?? 0),
    uniqueVisitors: Number(trafficRow?.visitors ?? 0),
    reviewCount: reactions.length,
    commentCounts,
    reactionTotals,
    socialEventTotals,
    trafficSources: sourceResult.results.map((row) => ({ source: row.traffic_source, views: Number(row.views ?? 0), visitors: Number(row.visitors ?? 0) })),
    socialEvents,
    landingPagesBySource: landingResult.results.map((row) => ({ source: row.traffic_source, page: row.landing_page, title: row.title ?? row.landing_page, visitors: Number(row.visitors ?? 0) })),
    topReviewsBySource: sourceReviewResult.results.map((row) => ({ source: row.traffic_source, slug: row.review_slug, title: row.title ?? row.review_slug, views: Number(row.views ?? 0), visitors: Number(row.visitors ?? 0) })),
    byType: byTypeResult.results.map((row) => ({ pageType: row.page_type, views: Number(row.views ?? 0) })),
    daily: dailyResult.results.map((row) => ({ day: row.day, views: Number(row.views ?? 0) })),
    topPages: topPagesResult.results.map((row) => ({
      pageKey: row.page_key,
      pageType: row.page_type,
      slug: row.review_slug,
      title: row.title ?? (row.page_type === 'home' ? 'The Lounge' : row.page_type === 'cine-cafe' ? 'Cini Café' : row.page_key),
      views: Number(row.views ?? 0), visitors: Number(row.visitors ?? 0),
    })),
    reactions,
  };

  const after = await db.prepare('SELECT version FROM analytics_revision WHERE id = 1').first<{ version: number }>();
  const oldestExpiry = trafficRow?.oldest_view == null ? Infinity : (Number(trafficRow.oldest_view) + safeDays * 86400 + 1) * 1000;
  const expiresAt = Math.min(now + 60000, oldestExpiry);
  if (after?.version === revision.version && expiresAt > Date.now()) {
    analyticsCache.set(db, { version: revision.version, days: safeDays, computedAt: now, expiresAt, value });
  }
  return value;
}

export async function adminReactionSyncWindow(cursor = 0, limit = 20): Promise<Record<string, number | boolean>> {
  const db = getContentDb();
  const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(Number(limit) || 20)));
  const totalRow = await db.prepare(`SELECT COUNT(*) AS count FROM reviews WHERE status = 'published'`).first<CountRow>();
  const total = Number(totalRow?.count ?? 0);
  const synced = Math.max(0, Math.min(safeLimit, total - safeCursor));
  const nextCursor = safeCursor + synced;
  return { synced, cursor: safeCursor, nextCursor, total, done: nextCursor >= total };
}
