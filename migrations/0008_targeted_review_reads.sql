-- Apply once to the existing D1 database before deploying the targeted reads.
-- Index construction belongs in deployment preparation, never page requests.

-- Match both filtering and display order so LIMIT avoids scanning/sorting all
-- approved comments. The stable review ID survives a changed review slug.
CREATE INDEX IF NOT EXISTS idx_comments_review_public_order
  ON comments(review_id, status, COALESCE(approved_at, created_at) DESC, id DESC)
  WHERE target_type = 'review';

CREATE INDEX IF NOT EXISTS idx_comments_lounge_public_order
  ON comments(target_id COLLATE NOCASE, status, COALESCE(approved_at, created_at) DESC, id DESC)
  WHERE target_type = 'lounge';

-- Same-language Related Reviews can stop after the required unfilled slots,
-- without inspecting other languages or sorting the complete language group.
CREATE INDEX IF NOT EXISTS idx_reviews_status_language_reviewed_date
  ON reviews(status, language COLLATE NOCASE, reviewed_date DESC, id DESC);
