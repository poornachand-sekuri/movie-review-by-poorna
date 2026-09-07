PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS legacy_comment_imports (
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (source, source_id),
  UNIQUE (comment_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_comment_imports_comment
  ON legacy_comment_imports(comment_id);
