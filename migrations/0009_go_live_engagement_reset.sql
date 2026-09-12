-- One-time go-live reset for pre-launch engagement data.
-- Review/content records are intentionally untouched.
PRAGMA foreign_keys = ON;

-- The production Worker can still read the preserved legacy reaction store for
-- migration safety. Mark every existing review as already migrated with zero
-- source votes so deleting D1 votes cannot resurrect pre-launch reactions.
INSERT INTO legacy_reaction_imports (review_id, source_slug, source_votes, imported_at)
SELECT
  r.id,
  COALESCE(json_extract(a.source_json, '$.s'), r.slug),
  0,
  CURRENT_TIMESTAMP
FROM reviews r
LEFT JOIN legacy_import_audit a ON a.review_id = r.id
ON CONFLICT(review_id) DO UPDATE SET
  source_slug = excluded.source_slug,
  source_votes = 0,
  imported_at = CURRENT_TIMESTAMP;

-- Canonical engagement records.
DELETE FROM review_reaction_votes;
UPDATE review_reaction_totals SET likes = 0, dislikes = 0;
DELETE FROM comments;
DELETE FROM page_views;

-- Force any cached analytics snapshot to observe the reset even if all tables
-- were already empty when this migration ran.
UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
