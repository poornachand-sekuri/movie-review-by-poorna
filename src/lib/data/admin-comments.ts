import { getContentDb } from '../cloudflare/content-db';
import { clean } from '../admin/values';
import { ensureAdminCommentSchema } from './admin-comment-schema';

interface CommentAdminRow {
  id: number;
  target_type: string;
  target_id: string;
  author_name: string;
  body: string;
  status: string;
  created_at: string;
  deleted_at: string | null;
}

export async function getAdminCommentCounts(): Promise<Record<string, number>> {
  await ensureAdminCommentSchema();
  const row = await getContentDb().prepare(`
    SELECT
      SUM(CASE WHEN deleted_at IS NULL AND status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN deleted_at IS NULL AND status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN deleted_at IS NULL AND status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted,
      COUNT(*) AS all_count
    FROM comments
  `).first<{ pending: number | null; approved: number | null; rejected: number | null; deleted: number | null; all_count: number | null }>();

  return {
    pending: Number(row?.pending ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    deleted: Number(row?.deleted ?? 0),
    all: Number(row?.all_count ?? 0),
  };
}

export async function listAdminComments(options: {
  status?: string;
  target?: string;
  limit?: number;
} = {}): Promise<{ comments: unknown[]; counts: Record<string, number> }> {
  await ensureAdminCommentSchema();
  const status = clean(options.status || 'pending', 20).toLowerCase();
  const target = clean(options.target, 20).toLowerCase();
  const limit = Math.max(1, Math.min(200, Math.trunc(Number(options.limit) || 200)));

  const where: string[] = [];
  const bindings: unknown[] = [];
  if (status === 'deleted') {
    where.push('c.deleted_at IS NOT NULL');
  } else if (status === 'all') {
    // No status filter.
  } else {
    const normalized = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
    where.push('c.deleted_at IS NULL');
    bindings.push(normalized);
    where.push(`c.status = ?${bindings.length}`);
  }

  if (target) {
    const normalizedTarget = target === 'home' ? 'lounge' : target;
    if (normalizedTarget === 'lounge' || normalizedTarget === 'review') {
      bindings.push(normalizedTarget);
      where.push(`c.target_type = ?${bindings.length}`);
    }
  }

  bindings.push(limit);
  const limitIndex = bindings.length;
  const sql = `
    SELECT c.id, c.target_type, c.target_id, c.author_name, c.body,
           c.status, c.created_at, c.deleted_at
    FROM comments c
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ?${limitIndex}
  `;

  let statement = getContentDb().prepare(sql);
  statement = statement.bind(...bindings);
  const [result, counts] = await Promise.all([
    statement.run<CommentAdminRow>(),
    getAdminCommentCounts(),
  ]);

  return {
    comments: result.results.map((row) => ({
      id: row.id,
      target_type: row.target_type === 'lounge' ? 'home' : row.target_type,
      target_id: row.target_id,
      name: row.author_name,
      email: '',
      comment: row.body,
      status: row.deleted_at ? 'deleted' : row.status,
      created_at: row.created_at,
    })),
    counts,
  };
}

export async function moderateAdminComment(commentId: number, action: string): Promise<boolean> {
  await ensureAdminCommentSchema();
  if (!Number.isInteger(commentId) || commentId <= 0) return false;
  const db = getContentDb();

  if (action === 'approve') {
    const result = await db.prepare(`
      UPDATE comments
      SET status = 'approved', deleted_at = NULL, moderated_at = CURRENT_TIMESTAMP,
          approved_at = CURRENT_TIMESTAMP
      WHERE id = ?1
    `).bind(commentId).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  if (action === 'reject') {
    const result = await db.prepare(`
      UPDATE comments
      SET status = 'rejected', deleted_at = NULL, moderated_at = CURRENT_TIMESTAMP,
          approved_at = NULL
      WHERE id = ?1
    `).bind(commentId).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  if (action === 'delete') {
    const result = await db.prepare(`
      UPDATE comments
      SET status = 'rejected', deleted_at = CURRENT_TIMESTAMP, moderated_at = CURRENT_TIMESTAMP,
          approved_at = NULL
      WHERE id = ?1
    `).bind(commentId).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  return false;
}

