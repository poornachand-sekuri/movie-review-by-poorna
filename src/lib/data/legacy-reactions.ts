import { env } from 'cloudflare:workers';
import { getContentDb } from '../cloudflare/content-db';
import type { LegacyVoteRow } from '../legacy-reaction-reader';

interface LegacyNamespace {
  getByName(slug: string): { exportVotes(after: string): Promise<LegacyVoteRow[]> };
}

export async function importLegacyReactions(reviewId?: number): Promise<void> {
  const source = (env as unknown as { LEGACY_REACTIONS?: LegacyNamespace }).LEGACY_REACTIONS;
  // Local databases have no production binding. Do not mark them as imported.
  if (!source) return;
  const db = getContentDb();
  const pendingQuery = db.prepare(`
    SELECT r.id, COALESCE(json_extract(a.source_json, '$.s'), r.slug) AS source_slug
    FROM reviews r
    LEFT JOIN legacy_import_audit a ON a.review_id = r.id
    LEFT JOIN legacy_reaction_imports i ON i.review_id = r.id
    WHERE i.review_id IS NULL AND r.status = 'published'
      ${reviewId === undefined ? '' : 'AND r.id = ?1'}
  `);
  // A single-review read must use the primary key, not scan the catalogue.
  const pending = await (reviewId === undefined ? pendingQuery : pendingQuery.bind(reviewId))
    .run<{ id: number; source_slug: string }>();

  // Bound cold-store work on the first catalogue read; subsequent reads are D1-only.
  const queue = [...pending.results];
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    let review;
    while ((review = queue.shift())) {
      const votes: LegacyVoteRow[] = [];
      const store = source.getByName(review.source_slug);
      let after = '';
      for (;;) {
        const page = await store.exportVotes(after);
        for (const vote of page) {
          if (!vote.voter_key || vote.voter_key <= after || !['like', 'dislike'].includes(vote.vote)) {
            throw new Error('Invalid preserved reaction data. Import was not committed.');
          }
          after = vote.voter_key;
          votes.push(vote);
        }
        if (page.length < 500) break;
      }
      // Copy and completion marker commit together. The marker condition also
      // prevents a concurrent/retried importer from resurrecting a removed vote.
      await db.batch([
        db.prepare(`
          INSERT INTO review_reaction_votes (review_id, voter_key, reaction, created_at, updated_at)
          SELECT ?1, json_extract(value, '$.voter_key'), json_extract(value, '$.vote'),
            json_extract(value, '$.updated_at'), json_extract(value, '$.updated_at')
          FROM json_each(?2)
          WHERE NOT EXISTS (SELECT 1 FROM legacy_reaction_imports WHERE review_id = ?1)
          ON CONFLICT(review_id, voter_key) DO NOTHING
        `).bind(review.id, JSON.stringify(votes)),
        db.prepare(`INSERT INTO legacy_reaction_imports (review_id, source_slug, source_votes)
          VALUES (?1, ?2, ?3) ON CONFLICT(review_id) DO NOTHING`).bind(review.id, review.source_slug, votes.length),
      ]);
    }
  }));
}
