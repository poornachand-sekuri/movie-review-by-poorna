import { getContentDb } from '../cloudflare/content-db';

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

interface CountRow {
  count: number | null;
}

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

let adminSchemaReady: Promise<void> | null = null;

function clean(value: unknown, max = 1000): string {
  return String(value ?? '').trim().slice(0, max);
}

function slugify(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
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

async function ensureAdminSchema(): Promise<void> {
  if (!adminSchemaReady) {
    adminSchemaReady = (async () => {
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
        db.prepare(`
          CREATE TABLE IF NOT EXISTS page_views (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            visitor_key TEXT NOT NULL,
            page_type TEXT NOT NULL,
            page_key TEXT NOT NULL,
            review_slug TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at DESC, id DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_type_created ON page_views(page_type, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_page_created ON page_views(page_key, created_at DESC)`),
        db.prepare(`CREATE INDEX IF NOT EXISTS idx_page_views_visitor_created ON page_views(visitor_key, created_at DESC)`),
      ]);
    })().catch((error) => {
      adminSchemaReady = null;
      throw error;
    });
  }
  return adminSchemaReady;
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

async function replaceCredits(reviewId: number, credits: Record<CreditField, string[]>): Promise<void> {
  const db = getContentDb();
  await db.prepare('DELETE FROM review_credits WHERE review_id = ?1').bind(reviewId).run();

  for (const field of CREDIT_FIELDS) {
    const role = CREDIT_ROLE[field];
    for (let position = 0; position < credits[field].length; position += 1) {
      const name = credits[field][position];
      if (!name) continue;
      await db.prepare('INSERT INTO people (name) VALUES (?1) ON CONFLICT(name) DO NOTHING').bind(name).run();
      const person = await db.prepare('SELECT id FROM people WHERE name COLLATE NOCASE = ?1 LIMIT 1').bind(name).first<{ id: number }>();
      if (!person?.id) continue;
      await db.prepare(`
        INSERT INTO review_credits (review_id, person_id, role, position)
        VALUES (?1, ?2, ?3, ?4)
      `).bind(reviewId, person.id, role, position).run();
    }
  }
}

async function replaceGallery(reviewId: number, gallery: string[]): Promise<void> {
  const db = getContentDb();
  await db.prepare('DELETE FROM review_gallery WHERE review_id = ?1').bind(reviewId).run();
  for (let position = 0; position < gallery.length; position += 1) {
    const imageUrl = gallery[position];
    if (!imageUrl) continue;
    await db.prepare(`
      INSERT INTO review_gallery (review_id, image_url, alt_text, position)
      VALUES (?1, ?2, NULL, ?3)
    `).bind(reviewId, imageUrl, position).run();
  }
}

async function refreshSearchText(reviewId: number, credits: Record<CreditField, string[]>): Promise<void> {
  const names = CREDIT_FIELDS.flatMap((field) => credits[field]);
  await getContentDb().prepare(`
    UPDATE reviews
    SET search_text = ?2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?1
  `).bind(reviewId, names.join(' ')).run();
}

export async function listAdminReviews(): Promise<AdminReviewRecord[]> {
  const db = getContentDb();
  const result = await db.prepare(`
    SELECT id, legacy_id, slug, title, language, release_date, reviewed_date,
           rating, verdict, excerpt, body_html, poster_url, updated_at
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

  const result = await db.prepare(`
    INSERT INTO reviews (
      slug, title, language, release_date, reviewed_date, rating, verdict, excerpt,
      body_html, poster_url, search_text, status, extra_json, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, '', 'published', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
  ).run();

  const reviewId = Number(result.meta.last_row_id ?? 0);
  if (!reviewId) throw new Error('Unable to create the review.');

  await replaceCredits(reviewId, value.credits);
  await replaceGallery(reviewId, value.gallery);
  await refreshSearchText(reviewId, value.credits);

  const created = await getAdminReview(reviewId);
  if (!created) throw new Error('Review was created but could not be reloaded.');
  return created;
}

export async function updateAdminReview(reviewId: number, input: AdminReviewInput): Promise<AdminReviewRecord | null> {
  if (!Number.isInteger(reviewId) || reviewId <= 0) return null;
  const existing = await getAdminReview(reviewId);
  if (!existing) return null;

  const value = validatedReview(input);
  const db = getContentDb();
  const duplicate = await db.prepare(`
    SELECT id FROM reviews
    WHERE slug COLLATE NOCASE = ?1 AND id <> ?2
    LIMIT 1
  `).bind(value.slug, reviewId).first<{ id: number }>();
  if (duplicate?.id) throw new Error('That URL slug is already in use.');

  await db.prepare(`
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
  ).run();

  await replaceCredits(reviewId, value.credits);
  await replaceGallery(reviewId, value.gallery);
  await refreshSearchText(reviewId, value.credits);
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

export async function getAdminCommentCounts(): Promise<Record<string, number>> {
  await ensureAdminSchema();
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
  await ensureAdminSchema();
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
  const result = await statement.run<CommentAdminRow>();
  const counts = await getAdminCommentCounts();

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
  await ensureAdminSchema();
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

export async function recordPageView(input: {
  visitorKey: string;
  pageType: string;
  pageKey: string;
  reviewSlug?: string | null;
}): Promise<void> {
  await ensureAdminSchema();
  const visitorKey = clean(input.visitorKey, 96);
  const pageType = clean(input.pageType, 40);
  const pageKey = clean(input.pageKey, 220);
  const reviewSlug = clean(input.reviewSlug, 180) || null;
  if (!visitorKey || !pageType || !pageKey) return;

  await getContentDb().prepare(`
    INSERT INTO page_views (visitor_key, page_type, page_key, review_slug, created_at)
    VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
  `).bind(visitorKey, pageType, pageKey, reviewSlug).run();
}

export async function getAdminAnalytics(days = 30): Promise<Record<string, unknown>> {
  await ensureAdminSchema();
  const safeDays = Math.max(1, Math.min(365, Math.trunc(Number(days) || 30)));
  const window = `-${safeDays} days`;
  const db = getContentDb();

  const [viewsRow, visitorsRow, reviewRow, byTypeResult, dailyResult, topPagesResult, reactionResult, commentCounts] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS count FROM page_views WHERE created_at >= datetime('now', ?1)`).bind(window).first<CountRow>(),
    db.prepare(`SELECT COUNT(DISTINCT visitor_key) AS count FROM page_views WHERE created_at >= datetime('now', ?1)`).bind(window).first<CountRow>(),
    db.prepare(`SELECT COUNT(*) AS count FROM reviews WHERE status = 'published'`).first<CountRow>(),
    db.prepare(`
      SELECT page_type, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= datetime('now', ?1)
      GROUP BY page_type
      ORDER BY views DESC, page_type
    `).bind(window).run<{ page_type: string; views: number }>(),
    db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS views
      FROM page_views
      WHERE created_at >= datetime('now', ?1)
      GROUP BY date(created_at)
      ORDER BY day ASC
    `).bind(window).run<{ day: string; views: number }>(),
    db.prepare(`
      SELECT
        pv.page_key,
        pv.page_type,
        pv.review_slug,
        COUNT(*) AS views,
        COUNT(DISTINCT pv.visitor_key) AS visitors,
        MAX(r.title) AS title
      FROM page_views pv
      LEFT JOIN reviews r ON r.slug COLLATE NOCASE = pv.review_slug
      WHERE pv.created_at >= datetime('now', ?1)
      GROUP BY pv.page_key, pv.page_type, pv.review_slug
      ORDER BY views DESC, visitors DESC, pv.page_key
      LIMIT 30
    `).bind(window).run<{ page_key: string; page_type: string; review_slug: string | null; views: number; visitors: number; title: string | null }>(),
    db.prepare(`
      SELECT
        r.slug,
        r.title,
        COALESCE(SUM(CASE WHEN v.reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes,
        COALESCE(SUM(CASE WHEN v.reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes
      FROM reviews r
      LEFT JOIN review_reaction_votes v ON v.review_id = r.id
      WHERE r.status = 'published'
      GROUP BY r.id, r.slug, r.title
      ORDER BY (likes + dislikes) DESC, likes DESC, r.reviewed_date DESC, r.id DESC
    `).run<{ slug: string; title: string; likes: number; dislikes: number }>(),
    getAdminCommentCounts(),
  ]);

  const reactions = reactionResult.results.map((row) => ({
    slug: row.slug,
    title: row.title,
    like: Number(row.likes ?? 0),
    dislike: Number(row.dislikes ?? 0),
  }));
  const reactionTotals = reactions.reduce((totals, row) => ({
    like: totals.like + row.like,
    dislike: totals.dislike + row.dislike,
  }), { like: 0, dislike: 0 });

  const since = new Date(Date.now() - safeDays * 86400000).toISOString().slice(0, 10);
  return {
    days: safeDays,
    since,
    views: Number(viewsRow?.count ?? 0),
    uniqueVisitors: Number(visitorsRow?.count ?? 0),
    reviewCount: Number(reviewRow?.count ?? 0),
    commentCounts,
    reactionTotals,
    byType: byTypeResult.results.map((row) => ({ pageType: row.page_type, views: Number(row.views ?? 0) })),
    daily: dailyResult.results.map((row) => ({ day: row.day, views: Number(row.views ?? 0) })),
    topPages: topPagesResult.results.map((row) => ({
      pageKey: row.page_key,
      pageType: row.page_type,
      slug: row.review_slug,
      title: row.title ?? (row.page_type === 'home' ? 'The Lounge' : row.page_type === 'cine-cafe' ? 'Cini Café' : row.page_key),
      views: Number(row.views ?? 0),
      visitors: Number(row.visitors ?? 0),
    })),
    reactions,
  };
}

export async function adminReactionSyncWindow(cursor = 0, limit = 20): Promise<Record<string, number | boolean>> {
  const db = getContentDb();
  const safeCursor = Math.max(0, Math.trunc(Number(cursor) || 0));
  const safeLimit = Math.max(1, Math.min(25, Math.trunc(Number(limit) || 20)));
  const totalRow = await db.prepare(`SELECT COUNT(*) AS count FROM reviews WHERE status = 'published'`).first<CountRow>();
  const total = Number(totalRow?.count ?? 0);
  const synced = Math.max(0, Math.min(safeLimit, total - safeCursor));
  const nextCursor = safeCursor + synced;
  return { synced, cursor: safeCursor, nextCursor, total, done: nextCursor >= total };
}
