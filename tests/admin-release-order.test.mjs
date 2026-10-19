import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db=createD1();
installBindings({CONTENT_DB:db});
const { createAdminReview, listAdminReviews, getAdminReview }=await import('../src/lib/data/admin-reviews.ts');

test('Manage Reviews and Social Studio source list sorts by movie release date newest first',async()=>{
  const base={l:'Telugu',r:3.25,body:'<p>Review body remains intact.</p>'};
  const oldRelease=await createAdminReview({...base,t:'Older release',s:'older-release',rd:'2025-11-10',d:'2026-10-12'});
  const newerReview=await createAdminReview({...base,t:'Latest release, reviewed earlier',s:'latest-earlier',rd:'2026-10-02',d:'2026-09-01'});
  const earlierRelease=await createAdminReview({...base,t:'Middle release',s:'middle-release',rd:'2026-09-15',d:'2026-10-20'});
  const undated=await createAdminReview({...base,t:'Missing release',s:'missing-release',rd:'',d:'2026-10-22'});
  const latestReview=await createAdminReview({...base,t:'Latest release, reviewed later',s:'latest-later',rd:'2026-10-02',d:'2026-10-11'});
  const sameDate=await createAdminReview({...base,t:'Latest release, same review date, newer record',s:'latest-tie',rd:'2026-10-02',d:'2026-10-11'});

  const order=[sameDate.i,latestReview.i,newerReview.i,earlierRelease.i,oldRelease.i,undated.i];
  const compact=await listAdminReviews(true);
  const full=await listAdminReviews(false);
  assert.deepEqual(compact.map(r=>r.i),order);
  assert.deepEqual(full.map(r=>r.i),order);
  assert.deepEqual(compact.map(r=>r.rd),['2026-10-02','2026-10-02','2026-10-02','2026-09-15','2025-11-10','']);
  assert.ok(compact.every(r=>r.body===''),'Compact API remains efficient.');
  assert.ok(full.every(r=>r.body===base.body),'Full review content remains unaffected.');
  assert.equal((await getAdminReview(undated.i)).d,'2026-10-22','Missing release does not overwrite review date.');
  assert.equal((await getAdminReview(newerReview.i)).r,3.25,'Rating is preserved.');
});

test('Both admin interfaces consume the release-ordered source without duplicating sorting',async()=>{
  const {readFileSync}=await import('node:fs');
  const admin=readFileSync('public/admin/admin.js','utf8');
  const studio=readFileSync('public/admin/social-studio.js','utf8');
  const page=readFileSync('src/admin/projector-room.html','utf8');
  assert.match(admin,/api\/admin\/reviews\?compact=1/);
  assert.match(studio,/api\/admin\/reviews\?compact=1/);
  assert.match(admin,/r\.rd \? 'Released ' \+ esc\(r\.rd\)/);
  assert.match(studio,/review\.rd \? review\.t \+ ' · Released ' \+ review\.rd/);
  assert.match(page,/Latest release first/);
});
