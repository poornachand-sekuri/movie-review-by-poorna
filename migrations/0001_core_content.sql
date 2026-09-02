PRAGMA foreign_keys = ON;

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_id INTEGER UNIQUE,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  title TEXT NOT NULL,
  language TEXT,
  release_date TEXT,
  reviewed_date TEXT NOT NULL,
  rating REAL CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  verdict TEXT,
  excerpt TEXT,
  body_html TEXT NOT NULL DEFAULT '',
  poster_url TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  extra_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(extra_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_reviews_status_reviewed_date
  ON reviews(status, reviewed_date DESC, id DESC);

CREATE INDEX idx_reviews_language
  ON reviews(language COLLATE NOCASE);

CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE review_credits (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
  role TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (review_id, person_id, role)
);

CREATE INDEX idx_review_credits_review_role_position
  ON review_credits(review_id, role, position);

CREATE INDEX idx_review_credits_person
  ON review_credits(person_id, review_id);

CREATE TABLE review_gallery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  UNIQUE (review_id, image_url)
);

CREATE INDEX idx_review_gallery_review_position
  ON review_gallery(review_id, position, id);

CREATE TABLE legacy_import_audit (
  review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  source_sha256 TEXT NOT NULL,
  source_json TEXT NOT NULL CHECK (json_valid(source_json)),
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
