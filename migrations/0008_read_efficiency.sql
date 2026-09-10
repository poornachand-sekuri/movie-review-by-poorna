-- Apply before deploying the read-efficiency code. Existing votes remain canonical.
-- Totals and the dashboard revision change inside the same transaction as a write.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS review_reaction_totals (
  review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
  likes INTEGER NOT NULL DEFAULT 0 CHECK (likes >= 0),
  dislikes INTEGER NOT NULL DEFAULT 0 CHECK (dislikes >= 0)
);

INSERT INTO review_reaction_totals (review_id, likes, dislikes)
SELECT review_id, SUM(reaction = 'like'), SUM(reaction = 'dislike')
FROM review_reaction_votes GROUP BY review_id
ON CONFLICT(review_id) DO UPDATE SET likes = excluded.likes, dislikes = excluded.dislikes;

CREATE TRIGGER IF NOT EXISTS reaction_totals_insert AFTER INSERT ON review_reaction_votes BEGIN
  INSERT INTO review_reaction_totals (review_id, likes, dislikes)
  VALUES (NEW.review_id, NEW.reaction = 'like', NEW.reaction = 'dislike')
  ON CONFLICT(review_id) DO UPDATE SET
    likes = likes + excluded.likes, dislikes = dislikes + excluded.dislikes;
END;

CREATE TRIGGER IF NOT EXISTS reaction_totals_delete AFTER DELETE ON review_reaction_votes BEGIN
  UPDATE review_reaction_totals
  SET likes = likes - (OLD.reaction = 'like'), dislikes = dislikes - (OLD.reaction = 'dislike')
  WHERE review_id = OLD.review_id;
END;

CREATE TRIGGER IF NOT EXISTS reaction_totals_update
AFTER UPDATE OF review_id, reaction ON review_reaction_votes
WHEN OLD.review_id <> NEW.review_id OR OLD.reaction <> NEW.reaction BEGIN
  UPDATE review_reaction_totals
  SET likes = likes - (OLD.reaction = 'like'), dislikes = dislikes - (OLD.reaction = 'dislike')
  WHERE review_id = OLD.review_id;
  INSERT INTO review_reaction_totals (review_id, likes, dislikes)
  VALUES (NEW.review_id, NEW.reaction = 'like', NEW.reaction = 'dislike')
  ON CONFLICT(review_id) DO UPDATE SET
    likes = likes + excluded.likes, dislikes = dislikes + excluded.dislikes;
END;

CREATE INDEX IF NOT EXISTS idx_comments_approved_review
  ON comments(review_id, COALESCE(approved_at, created_at) DESC, id DESC)
  WHERE target_type = 'review' AND status = 'approved';
CREATE INDEX IF NOT EXISTS idx_comments_approved_lounge
  ON comments(target_id COLLATE NOCASE, COALESCE(approved_at, created_at) DESC, id DESC)
  WHERE target_type = 'lounge' AND status = 'approved';
CREATE INDEX IF NOT EXISTS idx_reviews_published_language_date
  ON reviews(language COLLATE NOCASE, reviewed_date DESC, id DESC)
  WHERE status = 'published';

-- One revision row lets a dashboard poll detect changes without recounting history.
CREATE TABLE IF NOT EXISTS analytics_revision (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO analytics_revision (id, version) VALUES (1, 0) ON CONFLICT(id) DO NOTHING;

CREATE TRIGGER IF NOT EXISTS analytics_reviews_insert AFTER INSERT ON reviews BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_reviews_update AFTER UPDATE ON reviews BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_reviews_delete AFTER DELETE ON reviews BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_review_reaction_votes_insert AFTER INSERT ON review_reaction_votes BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_review_reaction_votes_update AFTER UPDATE ON review_reaction_votes BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_review_reaction_votes_delete AFTER DELETE ON review_reaction_votes BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_comments_insert AFTER INSERT ON comments BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_comments_update AFTER UPDATE ON comments BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_comments_delete AFTER DELETE ON comments BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_page_views_insert AFTER INSERT ON page_views BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_page_views_update AFTER UPDATE ON page_views BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;

CREATE TRIGGER IF NOT EXISTS analytics_page_views_delete AFTER DELETE ON page_views BEGIN
  UPDATE analytics_revision SET version = version + 1 WHERE id = 1;
END;
