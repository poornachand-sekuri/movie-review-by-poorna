import { getContentDb } from '../cloudflare/content-db';
import { clean, slugify } from '../admin/values';
import { ensureReactionSchema } from './reactions';
import { ensureCommentSchema } from './comments';

const CREDIT_FIELDS = ['actors', 'actresses', 'directors', 'music_directors'] as const;
type CreditField = (typeof CREDIT_FIELDS)[number];

const CREDIT_ROLE: Record<CreditField, string> = {
  actors: 'actor',
  actresses: 'actress',
  directors: 'director',
  music_directors: 'music_director',
};

export interface AdminReviewInput {
  t?: unknown;
  title?: unknown;
  s?: unknown;
  slug?: unknown;
  d?: unknown;
  publish_date?: unknown;
  rd?: unknown;
  release_date?: unknown;
  l?: unknown;
  language?: unknown;
  m?: unknown;
  poster?: unknown;
  r?: unknown;
  rating?: unknown;
  v?: unknown;
  popcorn_verdict?: unknown;
  e?: unknown;
  excerpt?: unknown;
  body?: unknown;
  gallery?: unknown;
  cast_crew?: unknown;
}

export interface AdminReviewRecord {
  i: number;
  t: string;
  s: string;
  d: string;
  l: string;
  m: string;
  c: number;
  e: string;
  rd: string;
  r: number | null;
  v: string;
  body: string;
  gallery: string[];
  cast_crew: Record<CreditField, string[]>;
  managed: boolean;
  updated_at: string | null;
}

interface ReviewRow {
  id: number;
  legacy_id: number | null;
  slug: string;
  title: string;
  language: string | null;
  release_date: string | null;
  reviewed_date: string;
  rating: number | null;
  verdict: string | null;
  excerpt: string | null;
  body_html: string;
  poster_url: string | null;
  updated_at: string;
}

interface CreditRow {
  name: string;
  role: string;
  position: number;
}

interface GalleryRow {
  image_url: string;
}

function sanitizeHtml(html: unknown): string {
  return String(html ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCredits(raw: unknown): Record<CreditField, string[]> {
  const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return Object.fromEntries(CREDIT_FIELDS.map((field) => {
    const values = Array.isArray(source[field]) ? source[field] : [];
    const unique = [...new Set(values.map((value) => clean(value, 120)).filter(Boolean))].slice(0, 30);
    return [field, unique];
  })) as Record<CreditField, string[]>;
}

function normalizeGallery(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .map((value) => clean(value, 1200))
    .filter(Boolean)
    .slice(0, 30);
}

function validatedReview(input: AdminReviewInput): {
  title: string;
  slug: string;
  reviewedDate: string;
  releaseDate: string | null;
  language: string;
  rating: number | null;
  posterUrl: string | null;
  verdict: string;
  excerpt: string;
  bodyHtml: string;
  credits: Record<CreditField, string[]>;
  gallery: string[];
} {
  const title = clean(input.t ?? input.title, 180);
  if (!title) throw new Error('Movie title is required.');

  const slug = slugify(input.s ?? input.slug ?? title);
  if (!slug) throw new Error('A valid URL slug is required.');

  const reviewedDate = clean(input.d ?? input.publish_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewedDate)) throw new Error('Review date must be YYYY-MM-DD.');

  const releaseDateText = clean(input.rd ?? input.release_date, 10);
  if (releaseDateText && !/^\d{4}-\d{2}-\d{2}$/.test(releaseDateText)) {
    throw new Error('Release date must be YYYY-MM-DD.');
  }

  const ratingRaw = input.r ?? input.rating;
  const rating = ratingRaw === '' || ratingRaw == null ? null : Number(ratingRaw);
  if (rating != null && (!Number.isFinite(rating) || rating < 0 || rating > 5)) {
    throw new Error('Rating must be between 0 and 5.');
  }

  const bodyHtml = sanitizeHtml(input.body);
  let excerpt = clean(input.e ?? input.excerpt, 700);
  let verdict = clean(input.v ?? input.popcorn_verdict, 260);
  if (!excerpt && bodyHtml) excerpt = stripHtml(bodyHtml).slice(0, 700);
  if (!verdict && excerpt) verdict = excerpt.split(/(?<=[.!?])\s+/)[0]?.slice(0, 260) ?? '';

  return {
    title,
    slug,
    reviewedDate,
    releaseDate: releaseDateText || null,
    language: clean(input.l ?? input.language, 80) || 'To be added',
    rating,
    posterUrl: clean(input.m ?? input.poster, 1200) || null,
    verdict,
    excerpt,
    bodyHtml,
    credits: normalizeCredits(input.cast_crew),
    gallery: normalizeGallery(input.gallery),
  };
}

function emptyCredits(): Record<CreditField, string[]> {
  return { actors: [], actresses: [], directors: [], music_directors: [] };
}

async function creditsForReview(reviewId: number): Promise<Record<CreditField, string[]>> {
  const db = getContentDb();
  const rows = await db.prepare(`
    SELECT p.name, rc.role, rc.position
    FROM review_credits rc
    JOIN people p ON p.id = rc.person_id
    WHERE rc.review_id = ?1
    ORDER BY rc.role, rc.position, p.name
  `).bind(reviewId).run<CreditRow>();

  const result = emptyCredits();
  for (const row of rows.results) {
    const field = CREDIT_FIELDS.find((candidate) => CREDIT_ROLE[candidate] === row.role);
    if (field) result[field].push(row.name);
  }
  return result;
}

async function galleryForReview(reviewId: number): Promise<string[]> {
  const db = getContentDb();
  const result = await db.prepare(`
    SELECT image_url
    FROM review_gallery
    WHERE review_id = ?1
    ORDER BY position, id
  `).bind(reviewId).run<GalleryRow>();
  return result.results.map((row) => row.image_url);
}

function mapAdminReview(row: ReviewRow, credits: Record<CreditField, string[]>, gallery: string[]): AdminReviewRecord {
  return {
    i: row.id,
    t: row.title,
    s: row.slug,
    d: row.reviewed_date,
    l: row.language ?? '',
    m: row.poster_url ?? '',
    c: 0,
    e: row.excerpt ?? '',
    rd: row.release_date ?? '',
    r: row.rating,
    v: row.verdict ?? '',
    body: row.body_html,
    gallery,
    cast_crew: credits,
    managed: true,
    updated_at: row.updated_at ?? null,
  };
}

/** All statements join the same review by its unique slug inside a single D1 batch.
 * JSON tables keep the statement count fixed at any supported cast/gallery size. */
function contentStatements(slug: string, credits: Record<CreditField, string[]>, gallery: string[]): D1PreparedStatement[] {
  const db = getContentDb();
  const rows = CREDIT_FIELDS.flatMap((field) => credits[field].map((name, position) => ({
    name, role: CREDIT_ROLE[field], position,
  })));
  const names = JSON.stringify(rows);
  return [
    db.prepare('DELETE FROM review_credits WHERE review_id = (SELECT id FROM reviews WHERE slug = ?1)').bind(slug),
    db.prepare(`INSERT INTO people (name)
      SELECT DISTINCT json_extract(value, '$.name') FROM json_each(?1) WHERE true
      ON CONFLICT(name) DO NOTHING`).bind(names),
    db.prepare(`INSERT INTO review_credits (review_id, person_id, role, position)
      SELECT r.id, p.id, json_extract(j.value, '$.role'), json_extract(j.value, '$.position')
      FROM json_each(?2) j
      JOIN people p ON p.name = json_extract(j.value, '$.name') COLLATE NOCASE
      JOIN reviews r ON r.slug = ?1`).bind(slug, names),
    db.prepare('DELETE FROM review_gallery WHERE review_id = (SELECT id FROM reviews WHERE slug = ?1)').bind(slug),
    db.prepare(`INSERT INTO review_gallery (review_id, image_url, alt_text, position)
      SELECT r.id, j.value, NULL, CAST(j.key AS INTEGER)
      FROM json_each(?2) j JOIN reviews r ON r.slug = ?1`).bind(slug, JSON.stringify(gallery)),
  ];
}

export async function listAdminReviews(compact = false): Promise<AdminReviewRecord[]> {
  const db = getContentDb();
  const result = await db.prepare(`
    SELECT id, legacy_id, slug, title, language, release_date, reviewed_date,
           rating, verdict, excerpt, ${compact ? "'' AS body_html" : 'body_html'}, poster_url, updated_at
    FROM reviews
    WHERE status <> 'archived'
    ORDER BY reviewed_date DESC, id DESC
  `).run<ReviewRow>();

  return result.results.map((row) => mapAdminReview(row, emptyCredits(), []));
}

export async function getAdminReview(reviewId: number): Promise<AdminReviewRecord | null> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return null;
  const db = getContentDb();
  const row = await db.prepare(`
    SELECT id, legacy_id, slug, title, language, release_date, reviewed_date,
           rating, verdict, excerpt, body_html, poster_url, updated_at
    FROM reviews
    WHERE id = ?1 AND status <> 'archived'
    LIMIT 1
  `).bind(reviewId).first<ReviewRow>();
  if (!row) return null;

  const [credits, gallery] = await Promise.all([
    creditsForReview(reviewId),
    galleryForReview(reviewId),
  ]);
  return mapAdminReview(row, credits, gallery);
}

export async function createAdminReview(input: AdminReviewInput): Promise<AdminReviewRecord> {
  const value = validatedReview(input);
  const db = getContentDb();
  const duplicate = await db.prepare('SELECT id FROM reviews WHERE slug COLLATE NOCASE = ?1 LIMIT 1').bind(value.slug).first<{ id: number }>();
  if (duplicate?.id) throw new Error('That URL slug is already in use.');

  const statement = db.prepare(`
    INSERT INTO reviews (
      slug, title, language, release_date, reviewed_date, rating, verdict, excerpt,
      body_html, poster_url, search_text, status, extra_json, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'published', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).bind(
    value.slug,
    value.title,
    value.language,
    value.releaseDate,
    value.reviewedDate,
    value.rating,
    value.verdict,
    value.excerpt,
    value.bodyHtml,
    value.posterUrl,
    CREDIT_FIELDS.flatMap((field) => value.credits[field]).join(' '),
  );
  await ensureReactionSchema();
  const [result] = await db.batch([
    statement,
    // New reviews have no pre-cutover votes, even when reusing a renamed URL.
    db.prepare(`INSERT INTO legacy_reaction_imports (review_id, source_slug, source_votes)
      SELECT id, slug, 0 FROM reviews WHERE slug = ?1`).bind(value.slug),
    ...contentStatements(value.slug, value.credits, value.gallery),
  ]);

  const reviewId = Number(result?.meta.last_row_id ?? 0);
  if (!reviewId) throw new Error('Unable to create the review.');


  const created = await getAdminReview(reviewId);
  if (!created) throw new Error('Review was created but could not be reloaded.');
  return created;
}

export async function updateAdminReview(reviewId: number, input: AdminReviewInput): Promise<AdminReviewRecord | null> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return null;
  const existing = await getContentDb().prepare(
    "SELECT id FROM reviews WHERE id = ?1 AND status <> 'archived'",
  ).bind(reviewId).first<{ id: number }>();
  if (!existing) return null;

  const value = validatedReview(input);
  const db = getContentDb();
  const duplicate = await db.prepare(`
    SELECT id FROM reviews
    WHERE slug COLLATE NOCASE = ?1 AND id <> ?2
    LIMIT 1
  `).bind(value.slug, reviewId).first<{ id: number }>();
  if (duplicate?.id) throw new Error('That URL slug is already in use.');

  const statement = db.prepare(`
    UPDATE reviews
    SET slug = ?2,
        title = ?3,
        language = ?4,
        release_date = ?5,
        reviewed_date = ?6,
        rating = ?7,
        verdict = ?8,
        excerpt = ?9,
        body_html = ?10,
        poster_url = ?11,
        search_text = ?12,
        status = 'published',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1
  `).bind(
    reviewId,
    value.slug,
    value.title,
    value.language,
    value.releaseDate,
    value.reviewedDate,
    value.rating,
    value.verdict,
    value.excerpt,
    value.bodyHtml,
    value.posterUrl,
    CREDIT_FIELDS.flatMap((field) => value.credits[field]).join(' '),
  );
  await ensureCommentSchema();
  await db.batch([
    statement,
    db.prepare("UPDATE comments SET target_id = ?2 WHERE target_type = 'review' AND review_id = ?1").bind(reviewId, value.slug),
    ...contentStatements(value.slug, value.credits, value.gallery),
  ]);
  return getAdminReview(reviewId);
}

export async function archiveAdminReview(reviewId: number): Promise<boolean> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return false;
  const result = await getContentDb().prepare(`
    UPDATE reviews
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1 AND status <> 'archived'
  `).bind(reviewId).run();
  return Number(result.meta.changes ?? 0) > 0;
}
