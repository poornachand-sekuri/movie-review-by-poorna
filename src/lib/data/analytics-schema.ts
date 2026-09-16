import { getContentDb } from '../cloudflare/content-db';

let ready: Promise<void> | null = null;

async function ensurePageViewColumns(db: D1Database): Promise<void> {
  const info = await db.prepare('PRAGMA table_info(page_views)').run<{ name: string }>();
  const columns = new Set(info.results.map((row) => row.name));
  const additions: Array<[string, string]> = [
    ['traffic_source', `ALTER TABLE page_views ADD COLUMN traffic_source TEXT NOT NULL DEFAULT 'unknown'`],
    ['source_detail', 'ALTER TABLE page_views ADD COLUMN source_detail TEXT'],
    ['campaign', 'ALTER TABLE page_views ADD COLUMN campaign TEXT'],
    ['landing_page', 'ALTER TABLE page_views ADD COLUMN landing_page TEXT'],
  ];

  for (const [name, sql] of additions) {
    if (columns.has(name)) continue;
    try {
      await db.prepare(sql).run();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/duplicate column name/i.test(message)) throw error;
    }
  }
}

export async function ensureAnalyticsSchema(): Promise<void> {
  if (!ready) {
    const db = getContentDb();
    ready = (async () => {
      await db.batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_key TEXT NOT NULL,
            page_type TEXT NOT NULL,
            page_key TEXT NOT NULL,
            review_slug TEXT,
            traffic_source TEXT NOT NULL DEFAULT 'unknown',
            source_detail TEXT,
            campaign TEXT,
            landing_page TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS analytics_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_key TEXT NOT NULL,
            event_type TEXT NOT NULL,
            platform TEXT NOT NULL,
            page_type TEXT NOT NULL,
            page_key TEXT NOT NULL,
            review_slug TEXT,
            traffic_source TEXT NOT NULL DEFAULT 'unknown',
            campaign TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      ]);

      await ensurePageViewColumns(db);

      await db.batch([
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC, id DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_type_created ON page_views(page_type, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_page_created ON page_views(page_key, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_visitor_created ON page_views(visitor_key, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_source_created ON page_views(traffic_source, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC, id DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_analytics_events_type_platform_created ON analytics_events(event_type, platform, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_created ON analytics_events(visitor_key, created_at DESC)`),
        db.prepare(`
          CREATE TRIGGER IF NOT EXISTS analytics_events_insert
          AFTER INSERT ON analytics_events BEGIN
            UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
          END
        `),
      ]);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
