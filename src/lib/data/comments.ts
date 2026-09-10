import { getContentDb } from '../cloudflare/content-db';

export type CommentTargetType = 'lounge' | 'review';

interface PublicComment {
  id: number;
  targetType: CommentTargetType;
  targetId: string;
  name: string;
  comment: string;
  createdAt: string;
  approvedAt: string | null;
}

interface ResolvedTarget {
  targetType: CommentTargetType;
  targetId: string;
  reviewId: number | null;
}

interface TargetReviewRow {
  id: number;
  slug: string;
}

interface CommentRow {
  id: number;
  target_type: string;
  target_id: string;
  author_name: string;
  body: string;
  created_at: string;
  approved_at: string | null;
}

interface CountRow {
  count: number | null;
}

const MAX_PUBLIC_COMMENTS = 20;
const SUBMISSION_WINDOW_MINUTES = 10;
const MAX_SUBMISSIONS_PER_WINDOW = 3;

let commentSchemaReady: Promise<void> | null = null;

export class CommentRateLimitError extends Error {
  constructor() {
    super('Please wait a few minutes before sending another comment.');
    this.name = 'CommentRateLimitError';
  }
}

export class CommentTargetNotFoundError extends Error {
  constructor() {
    super('The comments target could not be found.');
    this.name = 'CommentTargetNotFoundError';
  }
}

export async function ensureCommentSchema(): Promise<void> {
  if (!commentSchemaReady) {
    commentSchemaReady = (async () => {
      const db = getContentDb();
      await db.batch([
        db.prepare(`
          CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_type TEXT NOT NULL CHECK (target_type IN ('lounge', 'review')),
            target_id TEXT NOT NULL COLLATE NOCASE,
            review_id INTEGER REFERENCES reviews(id) ON DELETE CASCADE,
            author_name TEXT NOT NULL,
            body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            submitter_key TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            moderated_at TEXT,
            approved_at TEXT,
            CHECK (
              (target_type = 'lounge' AND review_id IS NULL) OR
              (target_type = 'review' AND review_id IS NOT NULL)
            )
          )
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_comments_public_target
          ON comments(target_type, target_id, status, approved_at DESC, created_at DESC, id DESC)
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_comments_moderation_queue
          ON comments(status, created_at DESC, id DESC)
        `),
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_comments_submitter_rate
          ON comments(submitter_key, created_at DESC)
        `),
      ]);
    })().catch((error) => {
      commentSchemaReady = null;
      throw error;
    });
  }

  return commentSchemaReady;
}

function clampInteger(value: number, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function parseTargetType(value: string): CommentTargetType | null {
  return value === 'lounge' || value === 'review' ? value : null;
}

function mapPublicComment(row: CommentRow): PublicComment {
  return {
    id: row.id,
    targetType: parseTargetType(row.target_type) ?? 'lounge',
    targetId: row.target_id,
    name: row.author_name,
    comment: row.body,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
  };
}

async function resolveTarget(targetType: CommentTargetType, targetId: string): Promise<ResolvedTarget | null> {
  if (targetType === 'lounge') {
    return { targetType: 'lounge', targetId: 'lounge', reviewId: null };
  }

  const normalizedTargetId = targetId.trim().slice(0, 180);
  if (!normalizedTargetId) return null;

  const db = getContentDb();
  const review = await db
    .prepare(
      `SELECT id, slug
       FROM reviews
       WHERE status = 'published'
         AND slug COLLATE NOCASE = ?1
       LIMIT 1`,
    )
    .bind(normalizedTargetId)
    .first<TargetReviewRow>();

  if (!review) return null;
  return { targetType: 'review', targetId: review.slug, reviewId: review.id };
}

export async function listApprovedComments(
  targetType: CommentTargetType,
  targetId: string,
  limit = 2,
): Promise<readonly PublicComment[]> {
  await ensureCommentSchema();
  const target = await resolveTarget(targetType, targetId);
  if (!target) return [];

  const safeLimit = clampInteger(limit, 2, 1, MAX_PUBLIC_COMMENTS);
  const db = getContentDb();
  const result = await db
    .prepare(
      `SELECT
         id,
         target_type,
         ?1 AS target_id,
         author_name,
         body,
         created_at,
         approved_at
       FROM comments
       WHERE ${target.targetType === 'review'
         ? "target_type = 'review' AND review_id = ?3"
         : "target_type = 'lounge' AND target_id COLLATE NOCASE = ?3"}
         AND status = 'approved'
       ORDER BY COALESCE(approved_at, created_at) DESC, id DESC
       LIMIT ?2`,
    )
    .bind(target.targetId, safeLimit, target.reviewId ?? target.targetId)
    .run<CommentRow>();

  return result.results.map(mapPublicComment);
}

export async function submitPendingComment(input: {
  targetType: CommentTargetType;
  targetId: string;
  name: string;
  comment: string;
  submitterKey: string;
}): Promise<{ id: number; status: 'pending' }> {
  await ensureCommentSchema();
  const target = await resolveTarget(input.targetType, input.targetId);
  if (!target) throw new CommentTargetNotFoundError();

  const name = input.name.trim().replace(/\s+/g, ' ').slice(0, 80);
  const body = input.comment.trim().replace(/\r\n?/g, '\n').slice(0, 1500);
  const submitterKey = input.submitterKey.trim().slice(0, 96);
  if (!submitterKey) throw new Error('A submitter key is required.');

  const db = getContentDb();
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM comments
       WHERE submitter_key = ?1
         AND created_at >= datetime('now', ?2)`,
    )
    .bind(submitterKey, `-${SUBMISSION_WINDOW_MINUTES} minutes`)
    .first<CountRow>();

  if (Number(recent?.count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
    throw new CommentRateLimitError();
  }

  const duplicate = await db
    .prepare(
      `SELECT id
       FROM comments
       WHERE submitter_key = ?1
         AND target_type = ?2
         AND ((?2 = 'review' AND review_id = ?6)
           OR (?2 = 'lounge' AND target_id COLLATE NOCASE = ?3))
         AND body = ?4
         AND created_at >= datetime('now', ?5)
       ORDER BY id DESC
       LIMIT 1`,
    )
    .bind(submitterKey, target.targetType, target.targetId, body, `-${SUBMISSION_WINDOW_MINUTES} minutes`, target.reviewId)
    .first<{ id: number }>();

  if (duplicate?.id) return { id: duplicate.id, status: 'pending' };

  const result = await db
    .prepare(
      `INSERT INTO comments (
         target_type,
         target_id,
         review_id,
         author_name,
         body,
         status,
         submitter_key,
         created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, CURRENT_TIMESTAMP)` ,
    )
    .bind(target.targetType, target.targetId, target.reviewId, name, body, submitterKey)
    .run();

  const id = Number(result.meta.last_row_id ?? 0);
  return { id, status: 'pending' };
}
