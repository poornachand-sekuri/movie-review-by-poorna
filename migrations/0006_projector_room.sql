PRAGMA foreign_keys = ON;

-- Soft deletion preserves moderation history while keeping deleted comments
-- out of the public Lounge and Auditorium feeds.
ALTER TABLE comments ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
  ON comments(deleted_at, created_at DESC, id DESC);

-- First-party traffic only. visitor_key is an opaque random browser cookie;
-- no IP address or user-agent fingerprint is stored.
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_key TEXT NOT NULL,
  page_type TEXT NOT NULL,
  page_key TEXT NOT NULL,
  review_slug TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at
  ON page_views(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_type_created
  ON page_views(page_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_page_created
  ON page_views(page_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_page_views_visitor_created
  ON page_views(visitor_key, created_at DESC);
