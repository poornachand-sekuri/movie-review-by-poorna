import assert from 'node:assert/strict';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { remoteD1 } from './d1-read-client.mjs';

// Baseline SQL is preserved from main 80af0a6. These are bounded, read-only probes,
// not a traffic load test. No cookies, identities, page views or votes are created.
const oldMarker = `SELECT r.id, COALESCE(json_extract(a.source_json, '$.s'), r.slug) AS source_slug
  FROM reviews r LEFT JOIN legacy_import_audit a ON a.review_id = r.id
  LEFT JOIN legacy_reaction_imports i ON i.review_id = r.id
  WHERE i.review_id IS NULL AND r.status = 'published' AND (?1 IS NULL OR r.id = ?1)`;
const newMarker = oldMarker.replace('(?1 IS NULL OR r.id = ?1)', 'r.id = ?1');
const oldSnapshot = `SELECT
  COALESCE(SUM(CASE WHEN reaction = 'like' THEN 1 ELSE 0 END), 0) AS likes,
  COALESCE(SUM(CASE WHEN reaction = 'dislike' THEN 1 ELSE 0 END), 0) AS dislikes,
  MAX(CASE WHEN voter_key = ?2 THEN reaction ELSE NULL END) AS viewer_reaction
  FROM review_reaction_votes WHERE review_id = ?1`;
const newSnapshot = `SELECT COALESCE(t.likes, 0) AS likes, COALESCE(t.dislikes, 0) AS dislikes,
  v.reaction AS viewer_reaction FROM (SELECT ?1 AS review_id) requested
  LEFT JOIN review_reaction_totals t ON t.review_id = requested.review_id
  LEFT JOIN review_reaction_votes v ON v.review_id = requested.review_id AND v.voter_key = ?2`;
const lookup = `SELECT id FROM reviews WHERE status = 'published' AND slug COLLATE NOCASE = ?1 LIMIT 1`;

export async function measureReads(query, samples, phase) {
  assert(['before', 'after'].includes(phase));
  assert(samples.length > 0 && samples.length <= 6);
  const cases = [];
  async function measure(name, action) {
    let rowsRead = 0, rowsWritten = 0, statements = 0;
    const execute = async (sql, params) => {
      const result = await query(sql, params);
      assert(Number.isFinite(result.meta?.rows_read), 'D1 did not return rows_read metadata.');
      rowsRead += result.meta.rows_read;
      rowsWritten += result.meta.rows_written;
      statements++;
      return result.results;
    };
    const data = await action(execute);
    assert.equal(rowsWritten, 0, 'A read probe unexpectedly wrote data.');
    // Retain no comment bodies, author names or visitor/voter identifiers in reports.
    const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
    cases.push({ name, statements, rowsRead, rowsWritten, fingerprint });
  }
  const review = samples[0];
  await measure('Single review import check', q => q(phase === 'before' ? oldMarker : newMarker, [review.id]));
  await measure('Single review reaction snapshot', q => q(phase === 'before' ? oldSnapshot : newSnapshot, [review.id, '']));
  await measure(`Cafe ${samples.length}-card refresh`, async q => {
    const counts = [];
    if (phase === 'before') {
      for (const sample of samples) {
        const [{ id }] = await q(lookup, [sample.slug]);
        await q(oldMarker, [id]);
        const [row] = await q(oldSnapshot, [id, '']);
        counts.push({ slug: sample.slug, likes: row.likes, dislikes: row.dislikes });
      }
    } else {
      const selected = await q(`SELECT DISTINCT r.id, r.slug
        FROM json_each(?1) requested CROSS JOIN reviews r ON r.slug COLLATE NOCASE = requested.value
        WHERE r.status = 'published'`, [JSON.stringify(samples.map(r => r.slug))]);
      const ids = JSON.stringify(selected.map(r => r.id));
      await q(`SELECT r.id, COALESCE(json_extract(a.source_json, '$.s'), r.slug) AS source_slug
        FROM json_each(?1) requested CROSS JOIN reviews r ON r.id = requested.value
        LEFT JOIN legacy_import_audit a ON a.review_id = r.id
        LEFT JOIN legacy_reaction_imports i ON i.review_id = r.id
        WHERE i.review_id IS NULL AND r.status = 'published'`, [ids]);
      counts.push(...await q(`SELECT r.slug, COALESCE(t.likes, 0) AS likes, COALESCE(t.dislikes, 0) AS dislikes
        FROM json_each(?1) requested CROSS JOIN reviews r ON r.id = requested.value
        LEFT JOIN review_reaction_totals t ON t.review_id = r.id WHERE r.status = 'published'`, [ids]));
    }
    return counts.sort((a,b) => a.slug.localeCompare(b.slug));
  });
  await measure('Two approved review comments', q => phase === 'before'
    ? q(`SELECT id, target_type, ?2 AS target_id, author_name, body, created_at, approved_at
      FROM comments WHERE target_type = ?1
      AND ((?1 = 'review' AND review_id = ?4) OR (?1 = 'lounge' AND target_id COLLATE NOCASE = ?2))
      AND status = 'approved' ORDER BY COALESCE(approved_at, created_at) DESC, id DESC LIMIT ?3`, ['review', review.slug, 2, review.id])
    : q(`SELECT id, target_type, ?1 AS target_id, author_name, body, created_at, approved_at
      FROM comments WHERE target_type = 'review' AND review_id = ?3 AND status = 'approved'
      ORDER BY COALESCE(approved_at, created_at) DESC, id DESC LIMIT ?2`, [review.slug, 2, review.id]));
  return { phase, measuredAt: new Date().toISOString(), samples, cases };
}

if (import.meta.main) {
  const phase = process.argv[2];
  assert(['before','after'].includes(phase), 'Choose before or after explicitly.');
  const baselinePath = process.argv[3] ?? '/tmp/mrp-d1-reads-before.json';
  const { query } = remoteD1();
  const baseline = phase === 'after' ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  const samples = baseline?.samples ?? (await query(`SELECT r.id, r.slug FROM reviews r
    WHERE r.status = 'published' AND EXISTS(SELECT 1 FROM legacy_reaction_imports i WHERE i.review_id = r.id)
    ORDER BY (r.slug = 'dc') DESC, r.reviewed_date DESC, r.id DESC LIMIT 6`)).results;
  const report = await measureReads(query, samples, phase);
  if (phase === 'before') writeFileSync(baselinePath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (phase === 'after') {
    const lines = ['### D1 read comparison', '', '| Operation | SQL before → after | Rows read before → after | Same returned data |', '| --- | --- | --- | --- |'];
    for (const after of report.cases) {
      const before = baseline.cases.find(c => c.name === after.name);
      assert(before, 'Baseline sample changed.');
      lines.push(`| ${after.name} | ${before.statements} → ${after.statements} | ${before.rowsRead} → ${after.rowsRead} | ${before.fingerprint === after.fingerprint ? 'Yes' : 'Changed during deployment; inspect'} |`);
    }
    lines.push('', 'Actual D1 metadata for these sampled SQL operations; baseline SQL is from main commit 80af0a6, including on later redeployments. This is not an overall site saving percentage. Cold initialization, legacy imports, personal-cookie merging, vote writes and dashboard cache hit rate are outside this read-only probe. No writes were made by the probes. Separate migration/backfill work is not included.', '');
    const summary = lines.join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
}
