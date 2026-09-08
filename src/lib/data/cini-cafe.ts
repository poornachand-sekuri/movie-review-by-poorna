import { ensureAllReactionImports } from './reactions';
import { getContentDb } from '../cloudflare/content-db';

export interface CiniCafeReview {
  id: number;
  slug: string;
  title: string;
  language: string | null;
  releaseDate: string | null;
  reviewedDate: string;
  rating: number | null;
  posterUrl: string | null;
  likes: number;
  searchTerms: readonly string[];
}

interface CafeReviewRow {
  id: number;
  slug: string;
  title: string;
  language: string | null;
  release_date: string | null;
  reviewed_date: string;
  rating: number | null;
  poster_url: string | null;
  likes: number | null;
}

interface CafeCreditRow {
  review_id: number;
  name: string;
}

export async function listCiniCafeReviews(): Promise<readonly CiniCafeReview[]> {
  await ensureAllReactionImports();
  const db = getContentDb();
  const [reviewResult, creditResult] = await db.batch([
    db.prepare(`
      SELECT
        r.id,
        r.slug,
        r.title,
        r.language,
        r.release_date,
        r.reviewed_date,
        r.rating,
        r.poster_url,
        COALESCE(SUM(CASE WHEN votes.reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes
      FROM reviews r
      LEFT JOIN review_reaction_votes votes ON votes.review_id = r.id
      WHERE r.status = 'published'
      GROUP BY r.id
      ORDER BY r.reviewed_date DESC, r.id DESC
    `),
    db.prepare(`
      SELECT
        rc.review_id,
        p.name
      FROM review_credits rc
      JOIN people p ON p.id = rc.person_id
      JOIN reviews r ON r.id = rc.review_id
      WHERE r.status = 'published'
        AND rc.role IN ('actor', 'actress', 'director', 'music_director')
      ORDER BY rc.review_id, rc.role, rc.position, p.name
    `),
  ]);

  const rows = (reviewResult?.results ?? []) as unknown as CafeReviewRow[];
  const credits = (creditResult?.results ?? []) as unknown as CafeCreditRow[];
  const termsByReview = new Map<number, string[]>();

  for (const credit of credits) {
    const terms = termsByReview.get(credit.review_id) ?? [];
    terms.push(credit.name);
    termsByReview.set(credit.review_id, terms);
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    language: row.language,
    releaseDate: row.release_date,
    reviewedDate: row.reviewed_date,
    rating: row.rating,
    posterUrl: row.poster_url,
    likes: Math.max(0, Number(row.likes ?? 0) || 0),
    searchTerms: termsByReview.get(row.id) ?? [],
  }));
}
