import { getContentDb } from '../cloudflare/content-db';
import { clean } from '../admin/values';
import { getAdminCommentCounts } from './admin-comments';
import { ensureAnalyticsSchema } from './analytics-schema';

interface CountRow { count: number | null }

export async function recordPageView(input: {
  visitorKey: string;
  pageType: string;
  pageKey: string;
  reviewSlug?: string | null;
}): Promise<void> {
  await ensureAnalyticsSchema();
  const visitorKey = clean(input.visitorKey, 96);
  const pageType = clean(input.pageType, 40);
  const pageKey = clean(input.pageKey, 220);
  const reviewSlug = clean(input.reviewSlug, 180) || null;
  if (!visitorKey || !pageType || !pageKey) return;

  await getContentDb().prepare(`
    INSERT INTO page_views (visitor_key, page_type, page_key, review_slug, created_at)
    VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
  `).bind(visitorKey, pageType, pageKey, reviewSlug).run();
}

export async function getAdminAnalytics(days = 30): Promise<Record<string, unknown>> {
  await ensureAnalyticsSchema();
  const safeDays = Math.max(1, Math.min(365, Math.trunc(Number(days) || 30)));
  const window = `-${safeDays} days`;
  const db = getContentDb();

  const [trafficRow, reviewRow, byTypeResult, dailyResult, topPagesResult, reactionResult, commentCounts] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_key) AS visitors
      FROM page_views WHERE created_at >= datetime('now', ?1)`).bind(window).first<{ views: number; visitors: number }>(),
    db.prepare(`SELECT COUNT(*) AS count FROM reviews WHERE status = 'published'`).first<CountRow>(),
    db.prepare(`
      SELECT page_type, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= datetime('now', ?1)
      GROUP BY page_type
      ORDER BY views DESC, page_type
    `).bind(window).run<{ page_type: string; views: number }>(),
    db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= datetime('now', ?1)
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).bind(window).run<{ day: string; views: number }>(),
    db.prepare(`
      SELECT
        pv.page_key,
        pv.page_type,
        pv.review_slug,
        COUNT(*) AS views,
        COUNT(DISTINCT pv.visitor_key) AS visitors,
        MAX(r.title) AS title
      FROM page_views pv
      LEFT JOIN reviews r ON r.slug COLLATE NOCASE = pv.review_slug
      WHERE pv.created_at >= datetime('now', ?1)
      GROUP BY pv.page_key, pv.page_type, pv.review_slug
      ORDER BY views DESC, visitors DESC, pv.page_key
      LIMIT 30
    `).bind(window).run<{ page_key: string; page_type: string; review_slug: string | null; views: number; visitors: number; title: string | null }>(),
    db.prepare(`
      SELECT
        r.slug,
        r.title,
        COALESCE(SUM(CASE WHEN v.reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes,
        COALESCE(SUM(CASE WHEN v.reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes
      FROM reviews r
      LEFT JOIN review_reaction_votes v ON v.review_id = r.id
      WHERE r.status = 'published'
      GROUP BY r.id, r.slug, r.title
      ORDER BY (likes + dislikes) DESC, likes DESC, r.reviewed_date DESC, r.id DESC
    `).run<{ slug: string; title: string; likes: number; dislikes: number }>(),
    getAdminCommentCounts(),
  ]);

  const reactions = reactionResult.results.map((row) => ({
    slug: row.slug,
    title: row.title,
    like: Number(row.likes ?? 0),
    dislike: Number(row.dislikes ?? 0),
  }));
  const reactionTotals = reactions.reduce((totals, row) => ({
    like: totals.like + row.like,
    dislike: totals.dislike + row.dislike,
  }), { like: 0, dislike: 0 });

  const since = new Date(Date.now() - safeDays * 86400000).toISOString().slice(0, 10);
  return {
    days: safeDays,
    since,
    views: Number(trafficRow?.views ?? 0),
    uniqueVisitors: Number(trafficRow?.visitors ?? 0),
    reviewCount: Number(reviewRow?.count ?? 0),
    commentCounts,
    reactionTotals,
    byType: byTypeResult.results.map((row) => ({ pageType: row.page_type, views: Number(row.views ?? 0) })),
    daily: dailyResult.results.map((row) => ({ day: row.day, views: Number(row.views ?? 0) })),
    topPages: topPagesResult.results.map((row) => ({
      pageKey: row.page_key,
      pageType: row.page_type,
      slug: row.review_slug,
      title: row.title ?? (row.page_type === 'home' ? 'The Lounge' : row.page_type === 'cine-cafe' ? 'Cini Café' : row.page_key),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
    })),
    reactions,
  };
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
