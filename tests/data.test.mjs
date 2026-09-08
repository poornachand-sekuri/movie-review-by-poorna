import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
installBindings({ CONTENT_DB: db, ADMIN_PASSWORD: 'test-only-password', ADMIN_SESSION_SECRET: 'test-only-secret' });
const reviews = await import('../src/lib/data/admin-reviews.ts');
const comments = await import('../src/lib/data/comments.ts');
const moderation = await import('../src/lib/data/admin-comments.ts');
const analytics = await import('../src/lib/data/analytics.ts');
const publicReviews = await import('../src/lib/data/reviews.ts');
const auth = await import('../src/lib/admin/auth.ts');

const input = { t: 'Cinema Test', s: 'cinema-test', d: '2026-09-01', rd: '2026-08-31', l: 'Telugu', r: 4,
  body: '<p>A complete review.</p>', gallery: ['/one.webp', '/two.webp'],
  cast_crew: { actors: ['Actor One', 'Actor Two'], actresses: ['Actress'], directors: ['Director'], music_directors: ['Composer'] } };
let review;
test('create preserves content, credit order, gallery and full-text search', async () => {
  review = await reviews.createAdminReview(input);
  assert.equal(review.body, input.body);
  assert.deepEqual(review.cast_crew, input.cast_crew);
  assert.deepEqual(review.gallery, input.gallery);
  assert.equal(review.r, 4);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM review_search WHERE review_search MATCH 'Composer'").get().n, 1);
  const detail = await publicReviews.getReviewBySlug('CINEMA-TEST');
  assert.equal(detail.bodyHtml, input.body);
  assert.equal(detail.credits.length, 5);
});

test('compact admin lists omit body data only when explicitly requested', async () => {
  const full = await reviews.listAdminReviews();
  const compact = await reviews.listAdminReviews(true);
  assert.equal(full[0].body, input.body);
  assert.equal(compact[0].body, '');
  assert.deepEqual({ ...full[0], body: '' }, compact[0]);
});

test('failed gallery writes roll back the entire update and new review', async () => {
  await assert.rejects(reviews.updateAdminReview(review.i, { ...input, t: 'Must roll back', gallery: ['/same', '/same'] }));
  assert.deepEqual(await reviews.getAdminReview(review.i), review);
  await assert.rejects(reviews.createAdminReview({ ...input, s: 'failed-create', gallery: ['/same', '/same'] }));
  assert.equal(await publicReviews.getReviewBySlug('failed-create'), null);
});

test('largest supported save uses a fixed-size transaction and preserves all content', async () => {
  const credits = Object.fromEntries(['actors', 'actresses', 'directors', 'music_directors'].map((role) =>
    [role, Array.from({ length: 30 }, (_, index) => `${role} ${index}`)]));
  const gallery = Array.from({ length: 30 }, (_, index) => `/gallery-${index}.webp`);
  const calls = db.metrics.calls;
  const saved = await reviews.updateAdminReview(review.i, { ...input, cast_crew: credits, gallery });
  assert.deepEqual(saved.cast_crew, credits);
  assert.deepEqual(saved.gallery, gallery);
  // Existence + uniqueness + one atomic save + three detail reads.
  assert.equal(db.metrics.calls - calls, 6);
});

test('moderation hides pending/deleted comments and can restore approval', async () => {
  const submitted = await comments.submitPendingComment({ targetType: 'review', targetId: input.s, name: 'Reader', comment: 'A useful review.', submitterKey: 'reader-1' });
  assert.equal((await comments.listApprovedComments('review', input.s)).length, 0);
  await moderation.moderateAdminComment(submitted.id, 'approve');
  assert.equal((await comments.listApprovedComments('review', input.s)).length, 1);
  await moderation.moderateAdminComment(submitted.id, 'delete');
  assert.equal((await comments.listApprovedComments('review', input.s)).length, 0);
  assert.equal((await moderation.getAdminCommentCounts()).deleted, 1);
  await moderation.moderateAdminComment(submitted.id, 'approve');
  assert.equal((await comments.listApprovedComments('review', input.s)).length, 1);
});

test('analytics preserves page totals and distinct visitors', async () => {
  await analytics.recordPageView({ visitorKey: 'one', pageType: 'home', pageKey: '/' });
  await analytics.recordPageView({ visitorKey: 'one', pageType: 'review', pageKey: '/review/cinema-test', reviewSlug: input.s });
  await analytics.recordPageView({ visitorKey: 'two', pageType: 'home', pageKey: '/' });
  const result = await analytics.getAdminAnalytics(30);
  assert.equal(result.views, 3);
  assert.equal(result.uniqueVisitors, 2);
  assert.equal(result.reviewCount, 1);
  assert.equal(result.byType.find((item) => item.pageType === 'home').views, 2);
});

test('admin authentication accepts signed sessions and fails closed for malformed cookies', async () => {
  const login = await auth.loginAdmin(new Request('https://example.com/api/admin/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password' }),
  }));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(await auth.isAdminAuthenticated(new Request('https://example.com/admin', { headers: { cookie } })), true);
  for (const cookie of ['mrp_admin=%E0%A4%A', 'mrp_admin=1.nonce.invalid', 'mrp_admin=invalid']) {
    assert.equal(await auth.isAdminAuthenticated(new Request('https://example.com/admin', { headers: { cookie } })), false);
  }
});

test('Lounge keeps new additions ahead of imported reviews, with stable dates, language and paging', async () => {
  const imported = await reviews.createAdminReview({ ...input, s: 'imported-new-date', d: '2030-01-01', l: 'Tamil' });
  db.sqlite.prepare('INSERT INTO legacy_import_audit (review_id, source_sha256, source_json) VALUES (?, ?, ?)').run(imported.i, 'fixture', '{}');
  const older = await reviews.createAdminReview({ ...input, s: 'manual-old-date', d: '2020-01-01' });
  db.sqlite.prepare("UPDATE reviews SET created_at = '2026-09-08 12:00:00' WHERE id = ?").run(older.i);
  db.sqlite.prepare("UPDATE reviews SET created_at = '2026-09-01 12:00:00' WHERE id = ?").run(review.i);
  const added = await publicReviews.listReviews({ order: 'added' });
  assert.deepEqual(added.map((item) => item.id), [older.i, review.i, imported.i]);
  assert.deepEqual((await publicReviews.listReviews({ order: 'added', language: 'TELUGU', offset: 1, limit: 1 })).map((item) => item.id), [review.i]);
  assert.equal((await publicReviews.listReviews())[0].id, imported.i);
  assert(!Object.hasOwn(added[0], 'bodyHtml'));
});
