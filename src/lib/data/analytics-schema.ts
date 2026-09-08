import { getContentDb } from '../cloudflare/content-db';

let ready: Promise<void> | null = null;

export async function ensureAnalyticsSchema(): Promise<void> {
  if (!ready) {
    const db = getContentDb();
    ready = db.batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_key TEXT NOT NULL,
            page_type TEXT NOT NULL,
            page_key TEXT NOT NULL,
            review_slug TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC, id DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_type_created ON page_views(page_type, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_page_created ON page_views(page_key, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_visitor_created ON page_views(visitor_key, created_at DESC)`),
    ]).then(() => {}).catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
