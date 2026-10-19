import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db=createD1();
installBindings({CONTENT_DB:db});
const reviews=await import('../src/lib/data/admin-reviews.ts');
const editorial=await import('../src/lib/data/editorial.ts');

const base={
  title:'Jyo Achyutananda',
  pov:'Original MY POV wording remains exactly the same.',
  language:'Telugu',rating:'4',
  titleCase:'uppercase',
  titleStyle:{family:'Oswald',size:37,weight:'700',color:'#060505',align:'center',line:1.11,auto:true},
  povStyle:{family:'Inter',size:26,weight:'600',color:'#F1F1F1',align:'left',line:1.28,auto:true},
  languageStyle:{family:'Oswald',size:38,color:'#F1F1F1',auto:true},
  styles:{title:[],pov:[]}
};

test('Batch recommendations use an atomic insert-only write and protect existing manual style',async()=>{
  const first=await reviews.createAdminReview({t:'Jyo Achyutananda',s:'jyo-achyutananda',rd:'2016-09-09',d:'2026-10-19',l:'Telugu',r:4,v:base.pov,body:'<p>Review</p>'});
  const second=await reviews.createAdminReview({t:'Saved styling',s:'saved-styling',rd:'2026-09-11',d:'2026-10-18',l:'Telugu',r:3,body:'<p>Review</p>'});
  assert.equal(await editorial.prepareSocialEditorialIfAbsent(first.i,base),true);
  assert.equal(await editorial.prepareSocialEditorialIfAbsent(first.i,{...base,title:'SHOULD NOT REPLACE'}),false);
  assert.equal((await editorial.getSocialEditorial(first.i)).drafts.shared.title,base.title);

  await editorial.saveSocialEditorial(second.i,'post',{...base,title:'SAVED CUSTOM POST'});
  assert.equal(await editorial.prepareSocialEditorialIfAbsent(second.i,base),false,
    'An existing platform-only override also protects the movie');
  const saved=(await editorial.getSocialEditorial(second.i)).drafts;
  assert.equal(saved.post.title,'SAVED CUSTOM POST');
  assert.equal(saved.shared,undefined);
  assert.equal((await reviews.getAdminReview(first.i)).v,base.pov,'Original review text must never change');
  assert.equal((await reviews.getAdminReview(first.i)).r,4,'Rating must never change');
});

test('Bulk recommendation sanitizes editorial data and refuses invalid movie identifiers',async()=>{
  await assert.rejects(editorial.prepareSocialEditorialIfAbsent(0,base),/Invalid review/);
  const invalid={...base,rating:'8'};
  await assert.rejects(editorial.prepareSocialEditorialIfAbsent(1,invalid),/Rating must use 0.25 increments/);
});
