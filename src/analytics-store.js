import { DurableObject } from 'cloudflare:workers';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function isoDay(value = Date.now()) {
  return new Date(value).toISOString().slice(0, 10);
}

function clean(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

export class AnalyticsStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS page_daily (
        day TEXT NOT NULL,
        page_type TEXT NOT NULL,
        page_key TEXT NOT NULL,
        slug TEXT,
        title TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(day, page_key)
      );
      CREATE INDEX IF NOT EXISTS page_daily_day_idx ON page_daily(day);
      CREATE INDEX IF NOT EXISTS page_daily_type_idx ON page_daily(page_type, day);

      CREATE TABLE IF NOT EXISTS visitor_page_daily (
        day TEXT NOT NULL,
        visitor_key TEXT NOT NULL,
        page_key TEXT NOT NULL,
        PRIMARY KEY(day, visitor_key, page_key)
      );
      CREATE INDEX IF NOT EXISTS visitor_page_day_idx ON visitor_page_daily(day);

      CREATE TABLE IF NOT EXISTS visitor_site_daily (
        day TEXT NOT NULL,
        visitor_key TEXT NOT NULL,
        PRIMARY KEY(day, visitor_key)
      );
      CREATE INDEX IF NOT EXISTS visitor_site_day_idx ON visitor_site_daily(day);

      CREATE TABLE IF NOT EXISTS reaction_summary (
        slug TEXT PRIMARY KEY,
        like_count INTEGER NOT NULL DEFAULT 0,
        dislike_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
  }

  track(request) {
    return request.json().then(body => {
      const visitorKey = clean(request.headers.get('x-mrp-voter'), 100);
      if (!visitorKey) return json({ error: 'Missing visitor identity' }, 400);

      const allowedTypes = new Set(['home', 'review', 'cine-cafe', 'search', 'other']);
      const pageType = allowedTypes.has(clean(body.pageType, 30)) ? clean(body.pageType, 30) : 'other';
      const pageKey = clean(body.pageKey, 220);
      const slug = clean(body.slug, 160) || null;
      const title = clean(body.title, 220) || null;
      if (!pageKey) return json({ error: 'Missing page key' }, 400);

      const day = isoDay();
      this.sql.exec(
        `INSERT INTO page_daily(day, page_type, page_key, slug, title, views)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(day, page_key) DO UPDATE SET
           views = page_daily.views + 1,
           page_type = excluded.page_type,
           slug = excluded.slug,
           title = COALESCE(excluded.title, page_daily.title)`,
        day,
        pageType,
        pageKey,
        slug,
        title
      );
      this.sql.exec(
        'INSERT OR IGNORE INTO visitor_page_daily(day, visitor_key, page_key) VALUES (?, ?, ?)',
        day,
        visitorKey,
        pageKey
      );
      this.sql.exec(
        'INSERT OR IGNORE INTO visitor_site_daily(day, visitor_key) VALUES (?, ?)',
        day,
        visitorKey
      );
      return json({ tracked: true });
    });
  }

  syncReaction(request) {
    return request.json().then(body => {
      const slug = clean(body.slug, 160);
      const like = Math.max(0, Number(body.like) || 0);
      const dislike = Math.max(0, Number(body.dislike) || 0);
      if (!slug) return json({ error: 'Missing slug' }, 400);
      this.sql.exec(
        `INSERT INTO reaction_summary(slug, like_count, dislike_count, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET
           like_count = excluded.like_count,
           dislike_count = excluded.dislike_count,
           updated_at = excluded.updated_at`,
        slug,
        like,
        dislike,
        new Date().toISOString()
      );
      return json({ synced: true });
    });
  }

  summary(url) {
    const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
    const since = isoDay(Date.now() - (days - 1) * 86400000);

    const totals = this.sql.exec(
      `SELECT COALESCE(SUM(views), 0) AS views
       FROM page_daily
       WHERE day >= ?`,
      since
    ).one();
    const unique = this.sql.exec(
      `SELECT COUNT(DISTINCT visitor_key) AS visitors
       FROM visitor_site_daily
       WHERE day >= ?`,
      since
    ).one();
    const byType = this.sql.exec(
      `SELECT page_type, COALESCE(SUM(views), 0) AS views
       FROM page_daily
       WHERE day >= ?
       GROUP BY page_type
       ORDER BY views DESC`,
      since
    ).toArray();
    const daily = this.sql.exec(
      `SELECT day, COALESCE(SUM(views), 0) AS views
       FROM page_daily
       WHERE day >= ?
       GROUP BY day
       ORDER BY day ASC`,
      since
    ).toArray();
    const topPages = this.sql.exec(
      `SELECT page_type, page_key, slug, MAX(title) AS title,
              COALESCE(SUM(views), 0) AS views
       FROM page_daily
       WHERE day >= ?
       GROUP BY page_type, page_key, slug
       ORDER BY views DESC
       LIMIT 50`,
      since
    ).toArray();
    const pageVisitors = this.sql.exec(
      `SELECT p.page_key, COUNT(DISTINCT p.visitor_key) AS visitors
       FROM visitor_page_daily p
       WHERE p.day >= ?
       GROUP BY p.page_key`,
      since
    ).toArray();
    const visitorsByPage = Object.fromEntries(pageVisitors.map(row => [row.page_key, Number(row.visitors) || 0]));
    const reactions = this.sql.exec(
      `SELECT slug, like_count AS like, dislike_count AS dislike, updated_at
       FROM reaction_summary
       ORDER BY (like_count + dislike_count) DESC, slug ASC`
    ).toArray();
    const reactionTotals = reactions.reduce((acc, row) => {
      acc.like += Number(row.like) || 0;
      acc.dislike += Number(row.dislike) || 0;
      return acc;
    }, { like: 0, dislike: 0 });

    return json({
      days,
      since,
      views: Number(totals?.views) || 0,
      uniqueVisitors: Number(unique?.visitors) || 0,
      byType: byType.map(row => ({ pageType: row.page_type, views: Number(row.views) || 0 })),
      daily: daily.map(row => ({ day: row.day, views: Number(row.views) || 0 })),
      topPages: topPages.map(row => ({
        pageType: row.page_type,
        pageKey: row.page_key,
        slug: row.slug || null,
        title: row.title || null,
        views: Number(row.views) || 0,
        visitors: visitorsByPage[row.page_key] || 0
      })),
      reactionTotals,
      reactions: reactions.map(row => ({
        slug: row.slug,
        like: Number(row.like) || 0,
        dislike: Number(row.dislike) || 0,
        updatedAt: row.updated_at
      }))
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/track') return this.track(request);
    if (request.method === 'POST' && url.pathname === '/reaction-sync') return this.syncReaction(request);
    if (request.method === 'GET' && url.pathname === '/summary') return this.summary(url);
    return json({ error: 'Not found' }, 404);
  }
}
