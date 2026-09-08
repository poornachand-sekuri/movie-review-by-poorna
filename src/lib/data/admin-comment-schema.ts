import { getContentDb } from '../cloudflare/content-db';
import { ensureCommentSchema } from './comments';

let ready: Promise<void> | null = null;

export async function ensureAdminCommentSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await ensureCommentSchema();
      const db = getContentDb();
      const columns = await db.prepare('PRAGMA table_info(comments)').run<{ name: string }>();
      if (!columns.results.some((column) => column.name === 'deleted_at')) {
        await db.prepare('ALTER TABLE comments ADD COLUMN deleted_at TEXT').run();
      }

      await db.batch([
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_comments_deleted_at
          ON comments(deleted_at, created_at DESC, id DESC)
        `),
      ]);
    })().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

