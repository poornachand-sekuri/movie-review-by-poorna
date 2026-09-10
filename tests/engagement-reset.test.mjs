import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createD1, installBindings } from './helpers/d1.mjs';

const reset = readFileSync('operations/reset-prelaunch-engagement.sql', 'utf8');

function fixture() {
  const db = createD1();
  db.sqlite.exec(`
    INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status,poster_url)
    VALUES (1,'published','Published','2026-09-10','<p>Keep this review</p>','published','/poster.webp'),
      (2,'draft','Draft','2026-09-10','<p>Draft content</p>','draft','/draft.webp'),
      (3,'archived','Archived','2026-09-10','<p>Archived content</p>','archived',NULL);
    INSERT INTO legacy_import_audit(review_id,source_sha256,source_json)
    VALUES (1,'fixture','{"s":"original-slug"}');
    INSERT INTO people(id,name) VALUES(1,'Director');
    INSERT INTO review_credits(review_id,person_id,role,position) VALUES(1,1,'director',0);
    INSERT INTO review_gallery(review_id,image_url,position) VALUES(1,'/gallery.webp',0);
    INSERT INTO review_reaction_votes(review_id,voter_key,reaction)
    VALUES(1,'a','like'),(1,'b','dislike'),(2,'c','like');
    INSERT INTO comments(id,target_type,target_id,review_id,author_name,body,status)
    VALUES(1,'review','published',1,'A','Approved','approved'),
      (2,'lounge','lounge',NULL,'B','Pending','pending'),
      (3,'review','draft',2,'C','Rejected','rejected');
    INSERT INTO legacy_comment_imports(source,source_id,comment_id) VALUES('old','1',1);
    INSERT INTO page_views(visitor_key,page_type,page_key) VALUES('a','home','/'),('b','review','/review/published');
  `);
  return db;
}

const rows = (db, table) => db.sqlite.prepare(`SELECT * FROM ${table}`).all();
const content = (db) => Object.fromEntries(['reviews','people','review_credits','review_gallery','legacy_import_audit']
  .map((table) => [table, rows(db, table)]));

test('reset clears every engagement category atomically while preserving content and import barriers', async () => {
  const db = fixture();
  const before = content(db);
  db.sqlite.exec(reset);
  assert.deepEqual(content(db), before);
  for (const table of ['review_reaction_votes','comments','legacy_comment_imports','page_views']) {
    assert.equal(rows(db, table).length, 0, table);
  }
  const marker = rows(db, 'engagement_resets')[0];
  assert.deepEqual([marker.votes_removed,marker.comments_removed,marker.views_removed,marker.reviews_preserved], [3,3,2,3]);
  assert.equal(rows(db, 'legacy_reaction_imports').length, 3, 'draft and archived reviews are protected too');
  assert.equal(db.sqlite.prepare('SELECT source_slug FROM legacy_reaction_imports WHERE review_id=1').get().source_slug, 'original-slug');

  let legacyReads = 0;
  installBindings({CONTENT_DB:db, LEGACY_REACTIONS:{getByName(){legacyReads++;throw Error('Must not import');}}});
  const { importLegacyReactions } = await import('../src/lib/data/legacy-reactions.ts');
  await importLegacyReactions();
  await importLegacyReactions(1);
  assert.equal(legacyReads,0,'older import code cannot resurrect votes after reset');
});

test('replaying the operation preserves new activity and its original completion record', () => {
  const db = fixture();
  db.sqlite.exec(reset);
  const marker = rows(db, 'engagement_resets');
  db.sqlite.exec(`
    INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(1,'new','like');
    INSERT INTO comments(target_type,target_id,author_name,body,status) VALUES('lounge','lounge','New','New comment','pending');
    INSERT INTO page_views(visitor_key,page_type,page_key) VALUES('new','home','/');
  `);
  const before = ['review_reaction_votes','comments','page_views'].map((table) => rows(db,table));
  db.sqlite.exec(reset);
  assert.deepEqual(['review_reaction_votes','comments','page_views'].map((table) => rows(db,table)),before);
  assert.deepEqual(rows(db,'engagement_resets'),marker);
  assert(rows(db,'comments')[0].id > 3,'comment IDs are not reused');
});

test('a failure during deletion rolls back all cleared data and permits a safe retry', () => {
  const db = fixture();
  const tables = ['review_reaction_votes','comments','legacy_comment_imports','page_views','legacy_reaction_imports'];
  const before = tables.map((table) => rows(db,table));
  db.sqlite.exec("CREATE TRIGGER fail_reset BEFORE DELETE ON page_views BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  assert.throws(() => db.sqlite.exec(reset),/simulated failure/);
  assert.deepEqual(tables.map((table) => rows(db,table)),before);
  assert.equal(rows(db,'engagement_resets').length,0);
  db.sqlite.exec('DROP TRIGGER fail_reset');
  db.sqlite.exec(reset);
  assert.equal(rows(db,'engagement_resets').length,1);
});
