import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
let legacyReads = 0;
installBindings({ CONTENT_DB: db, LEGACY_REACTIONS: { getByName(slug) {
  return { async exportVotes() {
    legacyReads++;
    return slug === 'original-slug' ? [{voter_key:'original-reader',vote:'like',updated_at:'2026-09-01T00:00:00Z'}] : [];
  } };
} } });
const admin = await import('../src/lib/data/admin-reviews.ts');
const reviews = await import('../src/lib/data/reviews.ts');
const reactions = await import('../src/lib/data/reactions.ts');
const comments = await import('../src/lib/data/comments.ts');
const moderation = await import('../src/lib/data/admin-comments.ts');
const cafe = await import('../src/lib/data/cini-cafe.ts');
const related = await import('../src/lib/data/related-reviews.ts');
const analytics = await import('../src/lib/data/analytics.ts');
const input = {t:'Original movie',s:'original-slug',d:'2026-09-08',rd:'2026-09-01',l:'Telugu',r:4,
  v:'Original POV',e:'Original excerpt',m:'/original.webp',body:'<p>Original review.</p>',
  cast_crew:{actors:['Actor A','Actor B'],actresses:['Actress A'],directors:['Director A'],music_directors:['Composer A']}};
let original;

test('new review automatically appears in detail, Lounge, Café and search with its own data', async () => {
  original = await admin.createAdminReview(input);
  const detail = await reviews.getReviewBySlug(input.s);
  assert.equal(detail.id, original.i);
  assert.equal(detail.bodyHtml,input.body);
  assert.equal(detail.posterUrl,input.m);
  assert.equal(detail.verdict,input.v);
  assert.equal(detail.credits.length,5);
  assert((await reviews.listReviews({order:'added'})).some(r=>r.id===original.i));
  assert((await cafe.listCiniCafeReviews()).some(r=>r.id===original.i));
  assert((await reviews.searchReviews('Actor A')).some(r=>r.id===original.i));
});

test('slug edits preserve identity, reactions and approved comments', async () => {
  await reactions.setReviewReaction(input.s,'original-reader','like',null,true);
  const submitted = await comments.submitPendingComment({targetType:'review',targetId:input.s,name:'Reader',comment:'Original comment',submitterKey:'comment-reader'});
  await moderation.moderateAdminComment(submitted.id,'approve');
  await admin.updateAdminReview(original.i,{...input,s:'renamed-slug',t:'Updated movie',body:'<p>Updated review.</p>'});
  assert.equal(await reviews.getReviewBySlug(input.s),null);
  assert.equal((await reviews.getReviewBySlug('renamed-slug')).id,original.i);
  assert.equal((await reactions.getReviewReactionSnapshotBySlug('renamed-slug')).likes,1);
  assert.equal((await comments.listApprovedComments('review','renamed-slug'))[0]?.comment,'Original comment');
  assert.equal((await comments.listApprovedComments('review',input.s)).length,0);
  // Also recover older records whose stored target slug was never updated.
  db.sqlite.prepare('UPDATE comments SET target_id=? WHERE id=?').run(input.s,submitted.id);
  assert.equal((await comments.listApprovedComments('review','renamed-slug'))[0]?.targetId,'renamed-slug');
});

test('a new review reusing the old slug starts at zero without inheriting preserved votes or comments', async () => {
  const beforeReads=legacyReads;
  const added=await admin.createAdminReview({...input,t:'Completely new movie',m:'/new.webp',body:'<p>New review.</p>'});
  assert.notEqual(added.i,original.i);
  assert.deepEqual(await reactions.getReviewReactionSnapshotBySlug(input.s),{likes:0,dislikes:0,viewerReaction:null});
  assert.equal((await comments.listApprovedComments('review',input.s)).length,0);
  assert.equal(legacyReads,beforeReads,'new reviews must not consult the old namespace');
  const submitted = await comments.submitPendingComment({targetType:'review',targetId:input.s,name:'Reader',comment:'Original comment',submitterKey:'comment-reader'});
  assert.equal(db.sqlite.prepare('SELECT review_id FROM comments WHERE id=?').get(submitted.id).review_id,added.i);
  await reactions.setReviewReaction(input.s,'new-reader','dislike',null,true);
  assert.equal((await reactions.getReviewReactionSnapshotBySlug('renamed-slug')).dislikes,0);
  const totals=(await analytics.getAdminAnalytics()).reactionTotals;
  assert.deepEqual(totals,{like:1,dislike:1});
  const recommendations=await related.listRelatedReviews(await reviews.getReviewBySlug(input.s));
  assert(recommendations.some(r=>r.id===original.i));
  assert(!recommendations.some(r=>r.id===added.i));
});

test('archiving hides a review from all public lookups while retaining its stored vote', async () => {
  await admin.archiveAdminReview(original.i);
  assert.equal(await reviews.getReviewBySlug('renamed-slug'),null);
  assert.equal(await reactions.getReviewReactionSnapshotBySlug('renamed-slug'),null);
  assert(!(await cafe.listCiniCafeReviews()).some(r=>r.id===original.i));
  assert(!(await reviews.listReviews()).some(r=>r.id===original.i));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM review_reaction_votes WHERE review_id=?').get(original.i).n,1);
});
