PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS review_reaction_votes (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  voter_key TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (review_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_review_reaction_votes_review_reaction
  ON review_reaction_votes(review_id, reaction);
