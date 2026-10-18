-- Unified Editorial v2: additive only. Existing review and engagement tables stay intact.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS editorial_presets (
  preset_key TEXT PRIMARY KEY,
  style_json TEXT NOT NULL CHECK (json_valid(style_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS social_promotional_drafts (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  format TEXT NOT NULL CHECK (format IN ('shared','post','story')),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, format)
);

CREATE TABLE IF NOT EXISTS review_verdict_formatting (
  review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  marks_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(marks_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
