import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('engagement tracking entrypoints remain wired end to end', () => {
  const layout = read('src/layouts/SiteFrame.astro');
  const analyticsClient = read('src/lib/analytics-client.ts');
  const analyticsRoute = read('src/pages/api/analytics.ts');
  const analyticsData = read('src/lib/data/analytics.ts');
  const reactionsRoute = read('src/pages/api/reviews/[slug]/reactions.ts');
  const reactionsData = read('src/lib/data/reactions.ts');
  const commentsRoute = read('src/pages/api/comments.ts');
  const commentsData = read('src/lib/data/comments.ts');
  const readEfficiency = read('migrations/0008_read_efficiency.sql');

  assert.match(layout, /recordCinemaPageView\(\)/, 'every SiteFrame page must record its page view');
  assert.match(analyticsClient, /fetch\('\/api\/analytics'/, 'browser analytics must call the page-view API');
  assert.match(analyticsClient, /keepalive:\s*true/, 'page-view delivery must survive navigation where possible');
  assert.match(analyticsRoute, /await recordPageView\(/, 'analytics API must persist the page view');
  assert.match(analyticsData, /INSERT INTO page_views/, 'page views must be written to D1');

  assert.match(reactionsRoute, /await setReviewReaction\(/, 'reaction API must persist likes and dislikes');
  assert.match(reactionsData, /INSERT INTO review_reaction_votes/, 'reaction votes must be written to D1');
  assert.match(reactionsData, /ON CONFLICT\(review_id, voter_key\) DO UPDATE/, 'one voter must update rather than duplicate a vote');
  assert.match(readEfficiency, /reaction_totals_insert/, 'reaction aggregate insert trigger must exist');
  assert.match(readEfficiency, /reaction_totals_delete/, 'reaction aggregate delete trigger must exist');
  assert.match(readEfficiency, /reaction_totals_update/, 'reaction aggregate update trigger must exist');

  assert.match(commentsRoute, /await submitPendingComment\(/, 'comment API must persist valid submissions');
  assert.match(commentsData, /INSERT INTO comments/, 'comments must be written to D1');
  assert.match(commentsData, /'pending'/, 'new comments must enter the moderation queue');

  assert.match(readEfficiency, /analytics_page_views_insert/, 'page-view analytics revision trigger must exist');
  assert.match(readEfficiency, /analytics_review_reaction_votes_insert/, 'reaction analytics revision trigger must exist');
  assert.match(readEfficiency, /analytics_comments_insert/, 'comment analytics revision trigger must exist');
});

test('the completed go-live reset cannot return to the deployment path', () => {
  const productionWorkflow = read('.github/workflows/deploy-production.yml');
  assert.doesNotMatch(productionWorkflow, /go-live engagement reset|go-live-reset|apply-go-live-reset/i);
  assert.equal(existsSync('scripts/apply-go-live-reset.mjs'), false);
  assert.equal(existsSync('migrations/0009_go_live_engagement_reset.sql'), false);
});
