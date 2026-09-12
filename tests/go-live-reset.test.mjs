import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createD1 } from './helpers/d1.mjs';

const resetSql = readFileSync('migrations/0009_go_live_engagement_reset.sql', 'utf8');

test('go-live migration clears engagement without deleting review content', () => {
  const db = createD1();
  db.sqlite.prepare("INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES(1,'dc','DC','2026-09-01','Body','published')").run();
  db.sqlite.prepare("INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES(2,'draft-review','Draft','2026-09-02','Body','draft')").run();
  db.sqlite.prepare("INSERT INTO legacy_import_audit(review_id,source_sha256,source_json) VALUES(1,'hash',?)")
    .run(JSON.stringify({ s: 'legacy-dc' }));
  db.sqlite.prepare("INSERT INTO legacy_reaction_imports(review_id,source_slug,source_votes) VALUES(1,'legacy-dc',2)").run();
  db.sqlite.prepare("INSERT INTO review_reaction_votes(review_id,voter_key,reaction) VALUES(1,'v1','like'),(1,'v2','dislike')").run();
  db.sqlite.prepare("INSERT INTO comments(id,target_type,target_id,review_id,author_name,body,status) VALUES(1,'review','dc',1,'Tester','Pre-launch comment','approved')").run();
  db.sqlite.prepare("INSERT INTO legacy_comment_imports(source,source_id,comment_id) VALUES('legacy','1',1)").run();
  db.sqlite.prepare("INSERT INTO page_views(visitor_key,page_type,page_key,review_slug) VALUES('visitor','review','/review/dc','dc')").run();

  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM review_reaction_votes').get().count, 2);
  assert.equal(db.sqlite.prepare('SELECT likes FROM review_reaction_totals WHERE review_id=1').get().likes, 1);

  db.sqlite.exec(resetSql);

  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM reviews').get().count, 2, 'review content must remain');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM page_views').get().count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM comments').get().count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM legacy_comment_imports').get().count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM review_reaction_votes').get().count, 0);
  assert.deepEqual(db.sqlite.prepare('SELECT likes,dislikes FROM review_reaction_totals WHERE review_id=1').get(), { likes: 0, dislikes: 0 });

  const markers = db.sqlite.prepare('SELECT review_id,source_slug,source_votes FROM legacy_reaction_imports ORDER BY review_id').all();
  assert.deepEqual(markers, [
    { review_id: 1, source_slug: 'legacy-dc', source_votes: 0 },
    { review_id: 2, source_slug: 'draft-review', source_votes: 0 },
  ]);
  db.sqlite.close();
});

test('production deployment runs reset only for the explicitly marked go-live commit', () => {
  const production = readFileSync('.github/workflows/deploy-production.yml', 'utf8');
  const preview = readFileSync('.github/workflows/deploy-preview.yml', 'utf8');
  assert.match(production, /Reset go-live engagement data[\s\S]*?\[go-live-reset\][\s\S]*?apply-go-live-reset\.mjs production/);
  assert.doesNotMatch(preview, /apply-go-live-reset\.mjs/);
});
