import assert from 'node:assert/strict';

export async function smokeReactions(base) {
  // Resolve the site's canonical host before sending a POST; a 301 may drop it.
  const canonical = new URL((await fetch(new URL('/review/dc', base))).url).origin;
  const voter = `smoke-${crypto.randomUUID()}`;
  const cookie = `mrp_reaction_voter=${voter}`;
  async function request(reaction, slug = 'dc', viewer = true) {
    const post = reaction !== undefined;
    const response = await fetch(`${canonical}/api/reviews/${slug}/reactions`, {
      method: post ? 'POST' : 'GET', cache: 'no-store',
      headers: { accept: 'application/json', ...(viewer ? { cookie } : {}),
        ...(post ? { 'content-type': 'application/json', origin: canonical } : {}) },
      ...(post ? {body:JSON.stringify({reaction,mode:'set'})} : {}),
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200);
    assert(response.headers.get('cache-control').includes('no-store'));
    const data = await response.json();
    assert(Number.isInteger(data.likes) && data.likes >= 0 && Number.isInteger(data.dislikes) && data.dislikes >= 0);
    return data;
  }
  const before = await request();
  const other = await request(undefined, 'coolie');
  assert.equal(before.viewerReaction,null);
  try {
    const liked = await request('like');
    assert.equal(liked.likes,before.likes+1);assert.equal(liked.dislikes,before.dislikes);
    assert.equal(liked.viewerReaction,'like');
    assert.deepEqual(await request('like'),liked,'retry must not toggle the vote off');
    assert.deepEqual(await request(),liked,'reload must preserve the vote');
    assert.equal((await request(undefined,'dc',false)).likes,liked.likes,'independent visitor must see the same total');
    const disliked=await request('dislike');
    assert.equal(disliked.likes,before.likes);assert.equal(disliked.dislikes,before.dislikes+1);
    assert.equal(disliked.viewerReaction,'dislike');
    assert.deepEqual(await request(undefined,'coolie'),other,'another review must not change');
  } finally {
    // Only this random test identity is removed; genuine votes are untouched.
    const restored = await request(null);
    assert.equal(restored.viewerReaction,null);
    assert.equal(restored.likes,before.likes);assert.equal(restored.dislikes,before.dislikes);
  }
  const final = await request();
  const html = await (await fetch(`${canonical}/review/dc`,{cache:'no-store'})).text();
  for(const [kind,count] of [['like',final.likes],['dislike',final.dislikes]]) {
    assert(new RegExp(`data-reaction-count="${kind}"[^>]*>\\s*${count}\\s*<`).test(html),`SSR ${kind} count must match API`);
  }
  const cafe = await (await fetch(`${canonical}/search`,{cache:'no-store'})).text();
  assert(new RegExp(`data-review-likes="dc"[^>]*>\\s*${final.likes}\\s*<`).test(cafe),'Café count must match API');
  console.log(JSON.stringify({reactionSmoke:'passed',dc:final,testVoteRemoved:true}));
}
