PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('lounge', 'review')),
  target_id TEXT NOT NULL COLLATE NOCASE,
  review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitter_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  moderated_at TEXT,
  approved_at TEXT,
  CHECK (
    (target_type = 'lounge' AND review_id IS NULL) OR
    (target_type = 'review' AND review_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_comments_public_target
  ON comments(target_type, target_id, status, approved_at DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comments_moderation_queue
  ON comments(status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_comments_submitter_rate
  ON comments(submitter_key, created_at DESC);
