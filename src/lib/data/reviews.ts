import type {
  ReviewCredit,
  ReviewDetail,
  ReviewGalleryItem,
  ReviewListOptions,
  ReviewSearchOptions,
  ReviewSearchResult,
  ReviewStatus,
  ReviewSummary,
} from '../../domain/review';
import { getContentDb } from '../cloudflare/content-db';

interface ReviewSummaryRow {
  id: number;
  slug: string;
  title: string;
  language: string | null;
  release_date: string | null;
  reviewed_date: string;
  rating: number | null;
  verdict: string | null;
  excerpt: string | null;
  poster_url: string | null;
}

interface ReviewDetailRow extends ReviewSummaryRow {
  legacy_id: number | null;
  body_html: string;
  status: string;
  extra_json: string;
  created_at: string;
  updated_at: string;
}

interface ReviewCreditRow {
  person_id: number;
  name: string;
  role: string;
  position: number;
}

interface ReviewGalleryRow {
  id: number;
  image_url: string;
  alt_text: string | null;
  position: number;
}

interface ReviewSearchRow extends ReviewSummaryRow {
  search_rank: number;
}

interface RelatedReviewRow extends ReviewSummaryRow {
  match_rank: number;
}

const SUMMARY_COLUMNS = `
  id,
  slug,
  title,
  language,
  release_date,
  reviewed_date,
  rating,
  verdict,
  excerpt,
  poster_url
`;

const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 60;
const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 40;
const MAX_SEARCH_TOKENS = 8;

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function mapSummary(row: ReviewSummaryRow): ReviewSummary {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    language: row.language,
    releaseDate: row.release_date,
    reviewedDate: row.reviewed_date,
    rating: row.rating,
    verdict: row.verdict,
    excerpt: row.excerpt,
    posterUrl: row.poster_url,
  };
}

function mapCredit(row: ReviewCreditRow): ReviewCredit {
  return {
    personId: row.person_id,
    name: row.name,
    role: row.role,
    position: row.position,
  };
}

function mapGalleryItem(row: ReviewGalleryRow): ReviewGalleryItem {
  return {
    id: row.id,
    imageUrl: row.image_url,
    altText: row.alt_text,
    position: row.position,
  };
}

function parseStatus(value: string): ReviewStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new Error(`Unexpected review status: ${value}`);
}

function parseExtraJson(value: string): Readonly<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // The database constrains this field to valid JSON. Fall back defensively if legacy data is ever malformed.
  }

  return {};
}

function buildSafeFtsQuery(query: string): string | null {
  const normalized = query.normalize('NFKC').trim().slice(0, 120);
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu)?.slice(0, MAX_SEARCH_TOKENS) ?? [];

  if (tokens.length === 0) return null;

  return tokens.map((token) => `"${token}"*`).join(' AND ');
}

export async function listReviews(options: ReviewListOptions = {}): Promise<readonly ReviewSummary[]> {
  const db = getContentDb();
  const limit = clampInteger(options.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT);
  const offset = clampInteger(options.offset, 0, 0, 10_000);
  const language = options.language?.trim().slice(0, 80) || null;
  const orderBy =
    options.order === 'added'
      ? `CASE
           WHEN EXISTS (
             SELECT 1
             FROM legacy_import_audit legacy
             WHERE legacy.review_id = reviews.id
           ) THEN 1
           ELSE 0
         END ASC,
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM legacy_import_audit legacy
             WHERE legacy.review_id = reviews.id
           ) THEN NULL
           ELSE created_at
         END DESC,
         reviewed_date DESC,
         id DESC`
      : 'reviewed_date DESC, id DESC';

  const statement = language
    ? db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS}
           FROM reviews
           WHERE status = 'published'
             AND language COLLATE NOCASE = ?1
           ORDER BY ${orderBy}
           LIMIT ?2 OFFSET ?3`,
        )
        .bind(language, limit, offset)
    : db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS}
           FROM reviews
           WHERE status = 'published'
           ORDER BY ${orderBy}
           LIMIT ?1 OFFSET ?2`,
        )
        .bind(limit, offset);

  const result = await statement.run<ReviewSummaryRow>();
  return result.results.map(mapSummary);
}

export async function listRelatedReviewsByCredits(
  reviewId: number,
  limit = 4,
): Promise<readonly ReviewSummary[]> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return [];

  const db = getContentDb();
  const relatedLimit = clampInteger(limit, 4, 1, 4);
  const result = await db
    .prepare(
      `WITH current_credits AS (
         SELECT
           person_id,
           role,
           position,
           CASE role
             WHEN 'director' THEN 1
             WHEN 'actor' THEN 2
             WHEN 'actress' THEN 3
             WHEN 'music_director' THEN 4
             ELSE 99
           END AS role_priority
         FROM review_credits
         WHERE review_id = ?1
           AND role IN ('director', 'actor', 'actress', 'music_director')
       ),
       candidate_matches AS (
         SELECT
           rc.review_id AS candidate_review_id,
           MIN((cc.role_priority * 1000) + cc.position) AS match_rank
         FROM review_credits rc
         JOIN current_credits cc
           ON cc.person_id = rc.person_id
          AND cc.role = rc.role
         WHERE rc.review_id <> ?1
         GROUP BY rc.review_id
       )
       SELECT
         r.id,
         r.slug,
         r.title,
         r.language,
         r.release_date,
         r.reviewed_date,
         r.rating,
         r.verdict,
         r.excerpt,
         r.poster_url,
         cm.match_rank
       FROM candidate_matches cm
       JOIN reviews r ON r.id = cm.candidate_review_id
       WHERE r.status = 'published'
       ORDER BY cm.match_rank ASC, r.reviewed_date DESC, r.id DESC
       LIMIT ?2`,
    )
    .bind(reviewId, relatedLimit)
    .run<RelatedReviewRow>();

  return result.results.map(mapSummary);
}

export async function getReviewBySlug(slug: string): Promise<ReviewDetail | null> {
  const normalizedSlug = slug.trim().slice(0, 180);
  if (!normalizedSlug) return null;

  const db = getContentDb();

  const [reviewResult, creditResult, galleryResult] = await db.batch([
    db
      .prepare(
        `SELECT
           ${SUMMARY_COLUMNS},
           legacy_id,
           body_html,
           status,
           extra_json,
           created_at,
           updated_at
         FROM reviews
         WHERE status = 'published'
           AND slug COLLATE NOCASE = ?1
         LIMIT 1`,
      )
      .bind(normalizedSlug),
    db
      .prepare(
        `SELECT
           p.id AS person_id,
           p.name,
           rc.role,
           rc.position
         FROM review_credits rc
         JOIN people p ON p.id = rc.person_id
         JOIN reviews r ON r.id = rc.review_id
         WHERE r.status = 'published'
           AND r.slug COLLATE NOCASE = ?1
         ORDER BY rc.role, rc.position, p.name`,
      )
      .bind(normalizedSlug),
    db
      .prepare(
        `SELECT
           g.id,
           g.image_url,
           g.alt_text,
           g.position
         FROM review_gallery g
         JOIN reviews r ON r.id = g.review_id
         WHERE r.status = 'published'
           AND r.slug COLLATE NOCASE = ?1
         ORDER BY g.position, g.id`,
      )
      .bind(normalizedSlug),
  ]);

  const row = reviewResult?.results[0] as ReviewDetailRow | undefined;
  if (!row) return null;

  const credits = (creditResult?.results ?? []) as unknown as ReviewCreditRow[];
  const gallery = (galleryResult?.results ?? []) as unknown as ReviewGalleryRow[];

  return {
    ...mapSummary(row),
    legacyId: row.legacy_id,
    bodyHtml: row.body_html,
    status: parseStatus(row.status),
    extra: parseExtraJson(row.extra_json),
    credits: credits.map(mapCredit),
    gallery: gallery.map(mapGalleryItem),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function searchReviews(
  query: string,
  options: ReviewSearchOptions = {},
): Promise<readonly ReviewSearchResult[]> {
  const ftsQuery = buildSafeFtsQuery(query);
  if (!ftsQuery) return [];

  const db = getContentDb();
  const limit = clampInteger(options.limit, DEFAULT_SEARCH_LIMIT, 1, MAX_SEARCH_LIMIT);

  const result = await db
    .prepare(
      `SELECT
         r.id,
         r.slug,
         r.title,
         r.language,
         r.release_date,
         r.reviewed_date,
         r.rating,
         r.verdict,
         r.excerpt,
         r.poster_url,
         bm25(review_search, 10.0, 2.0, 1.0, 1.0, 0.35) AS search_rank
       FROM review_search
       JOIN reviews r ON r.id = review_search.rowid
       WHERE review_search MATCH ?1
         AND r.status = 'published'
       ORDER BY search_rank ASC, r.reviewed_date DESC, r.id DESC
       LIMIT ?2`,
    )
    .bind(ftsQuery, limit)
    .run<ReviewSearchRow>();

  return result.results.map((row) => ({
    ...mapSummary(row),
    relevance: Number.isFinite(row.search_rank) ? -row.search_rank : 0,
  }));
}
