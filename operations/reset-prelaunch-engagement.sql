-- Owner-authorized fresh start for movie-review-by-poorna-content.
-- Run explicitly after deploying the runtime that retires automatic imports.
-- Never add this operation to automatic migrations or deployment workflows.
-- Review content, credits, gallery, assets and ID sequences are not cleared.

CREATE TABLE IF NOT EXISTS engagement_resets (
  reset_key TEXT PRIMARY KEY,
  reset_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  votes_removed INTEGER NOT NULL,
  comments_removed INTEGER NOT NULL,
  views_removed INTEGER NOT NULL,
  reviews_preserved INTEGER NOT NULL
);

-- All changes occur inside one INSERT statement's transaction. If any delete
-- fails, both the data changes and the completion marker roll back together.
CREATE TRIGGER IF NOT EXISTS reset_prelaunch_engagement_20260910
AFTER INSERT ON engagement_resets
WHEN NEW.reset_key = 'prelaunch-2026-09-10'
BEGIN
  -- Mark every existing review, including drafts/archived reviews. An older
  -- Worker or an importer already in flight cannot restore its archived votes.
  INSERT INTO legacy_reaction_imports (review_id, source_slug, source_votes)
  SELECT r.id, COALESCE(json_extract(a.source_json, '$.s'), r.slug), 0
  FROM reviews r
  LEFT JOIN legacy_import_audit a ON a.review_id = r.id
  WHERE 1
  ON CONFLICT(review_id) DO NOTHING;

  DELETE FROM review_reaction_votes;
  DELETE FROM legacy_comment_imports;
  DELETE FROM comments;
  DELETE FROM page_views;
END;

-- A retry does nothing after the first successful reset, preserving new votes,
-- comments and views. Do not change or remove this durable reset key.
INSERT INTO engagement_resets (
  reset_key, votes_removed, comments_removed, views_removed, reviews_preserved
)
SELECT 'prelaunch-2026-09-10',
  (SELECT COUNT(*) FROM review_reaction_votes),
  (SELECT COUNT(*) FROM comments),
  (SELECT COUNT(*) FROM page_views),
  (SELECT COUNT(*) FROM reviews)
WHERE NOT EXISTS (
  SELECT 1 FROM engagement_resets WHERE reset_key = 'prelaunch-2026-09-10'
);

DROP TRIGGER IF EXISTS reset_prelaunch_engagement_20260910;

SELECT * FROM engagement_resets WHERE reset_key = 'prelaunch-2026-09-10';
SELECT
  (SELECT COUNT(*) FROM review_reaction_votes) AS current_votes,
  (SELECT COUNT(*) FROM comments) AS current_comments,
  (SELECT COUNT(*) FROM page_views) AS current_views,
  (SELECT COUNT(*) FROM reviews) AS current_reviews;
