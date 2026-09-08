-- Records a complete, atomic copy of each preserved production reaction store.
CREATE TABLE IF NOT EXISTS legacy_reaction_imports (
  review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  source_slug TEXT NOT NULL,
  source_votes INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
