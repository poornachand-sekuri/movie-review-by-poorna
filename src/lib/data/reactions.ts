import { getContentDb } from '../cloudflare/content-db';
import { importLegacyReactions } from './legacy-reactions';

export type ReviewReaction = 'like' | 'dislike';

interface ReviewReactionSnapshot {
  likes: number;
  dislikes: number;
  viewerReaction: ReviewReaction | null;
}

interface ReviewIdRow {
  id: number;
}

interface ReactionAggregateRow {
  likes: number | null;
  dislikes: number | null;
  viewer_reaction: string | null;
}

let reactionSchemaReady: Promise<void> | null = null;

export async function ensureReactionSchema(): Promise<void> {
  if (!reactionSchemaReady) {
    reactionSchemaReady = (async () => {
      const db = getContentDb();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS legacy_reaction_imports (
          review_id INTEGER PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
          source_slug TEXT NOT NULL, source_votes INTEGER NOT NULL,
          imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`),
        db.prepare(`
          CREATE TABLE IF NOT EXISTS review_reaction_votes (
            review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
            voter_key TEXT NOT NULL,
            reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (review_id, voter_key)
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_review_reaction_votes_review_reaction
          ON review_reaction_votes(review_id, reaction)
        `),
      ]);
    })().catch((error) => {
      reactionSchemaReady = null;
      throw error;
    });
  }

  return reactionSchemaReady;
}

function normalizeVoterKey(voterKey: string | null | undefined): string | null {
  const normalized = voterKey?.trim().slice(0, 96) ?? '';
  return normalized || null;
}

function parseViewerReaction(value: string | null | undefined): ReviewReaction | null {
  return value === 'like' || value === 'dislike' ? value : null;
}

async function getPublishedReviewId(slug: string): Promise<number | null> {
  const normalizedSlug = slug.trim().slice(0, 180);
  if (!normalizedSlug) return null;

  const db = getContentDb();
  const row = await db
    .prepare(
      `SELECT id
       FROM reviews
       WHERE status = 'published'
         AND slug COLLATE NOCASE = ?1
       LIMIT 1`,
    )
    .bind(normalizedSlug)
    .first<ReviewIdRow>();

  return row?.id ?? null;
}

export async function getReviewReactionSnapshot(
  reviewId: number,
  voterKey?: string | null,
  legacyVoterKey?: string | null,
): Promise<ReviewReactionSnapshot> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) {
    return { likes: 0, dislikes: 0, viewerReaction: null };
  }

  await ensureReactionSchema();
  await importLegacyReactions(reviewId);
  await reconcileVoterIdentity(reviewId, voterKey, legacyVoterKey);
  const db = getContentDb();
  const normalizedVoterKey = normalizeVoterKey(voterKey);

  const row = await db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes,
         COALESCE(SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes,
         MAX(CASE WHEN voter_key = ?2 THEN reaction ELSE NULL END) AS viewer_reaction
       FROM review_reaction_votes
       WHERE review_id = ?1`,
    )
    .bind(reviewId, normalizedVoterKey ?? '')
    .first<ReactionAggregateRow>();

  return {
    likes: Math.max(0, Number(row?.likes ?? 0) || 0),
    dislikes: Math.max(0, Number(row?.dislikes ?? 0) || 0),
    viewerReaction: parseViewerReaction(row?.viewer_reaction),
  };
}

export async function getReviewReactionSnapshotBySlug(
  slug: string,
  voterKey?: string | null,
  legacyVoterKey?: string | null,
): Promise<ReviewReactionSnapshot | null> {
  await ensureReactionSchema();
  const reviewId = await getPublishedReviewId(slug);
  if (!reviewId) return null;
  return getReviewReactionSnapshot(reviewId, voterKey, legacyVoterKey);
}

export async function setReviewReaction(
  slug: string,
  voterKey: string,
  reaction: ReviewReaction | null,
  legacyVoterKey?: string | null,
  explicit = false,
): Promise<ReviewReactionSnapshot | null> {
  await ensureReactionSchema();

  const normalizedVoterKey = normalizeVoterKey(voterKey);
  if (!normalizedVoterKey) throw new Error('A voter key is required.');

  const reviewId = await getPublishedReviewId(slug);
  if (!reviewId) return null;

  await importLegacyReactions(reviewId);
  await reconcileVoterIdentity(reviewId, normalizedVoterKey, legacyVoterKey);
  const db = getContentDb();
  const existing = explicit ? null : await db
    .prepare(
      `SELECT reaction
       FROM review_reaction_votes
       WHERE review_id = ?1 AND voter_key = ?2
       LIMIT 1`,
    )
    .bind(reviewId, normalizedVoterKey)
    .first<{ reaction: string }>();

  if (reaction === null || existing?.reaction === reaction) {
    await db
      .prepare('DELETE FROM review_reaction_votes WHERE review_id = ?1 AND voter_key = ?2')
      .bind(reviewId, normalizedVoterKey)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO review_reaction_votes (
           review_id,
           voter_key,
           reaction,
           created_at,
           updated_at
         ) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(review_id, voter_key) DO UPDATE SET
           reaction = excluded.reaction,
           updated_at = CURRENT_TIMESTAMP`,
      )
      .bind(reviewId, normalizedVoterKey, reaction)
      .run();
  }

  return getReviewReactionSnapshot(reviewId, normalizedVoterKey);
}

// Browsers that visited both runtimes may carry both cookies. Keep their newer
// D1 choice and merge the old identity instead of counting the same browser twice.
async function reconcileVoterIdentity(reviewId: number, voterKey?: string | null, legacyVoterKey?: string | null) {
  const current = normalizeVoterKey(voterKey);
  const legacy = normalizeVoterKey(legacyVoterKey);
  if (!current || !legacy || current === legacy) return;
  const db = getContentDb();
  await db.batch([
    db.prepare(`INSERT INTO review_reaction_votes (review_id, voter_key, reaction, created_at, updated_at)
      SELECT review_id, ?2, reaction, created_at, updated_at FROM review_reaction_votes
      WHERE review_id = ?1 AND voter_key = ?3
      ON CONFLICT(review_id, voter_key) DO NOTHING`).bind(reviewId, current, legacy),
    db.prepare('DELETE FROM review_reaction_votes WHERE review_id = ?1 AND voter_key = ?2').bind(reviewId, legacy),
  ]);
}

export async function ensureAllReactionImports(): Promise<void> {
  await ensureReactionSchema();
  await importLegacyReactions();
}
