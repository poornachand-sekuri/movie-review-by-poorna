# Read-efficiency rollout

The user authorized merging this branch and deploying after the daily quota resets, then checking whether reads decrease. Stay on the Free plan and preserve all review, vote, comment and view data. The deleted earlier branches must not be revived.

## Order and gates

1. Finish validation on `refactor/architecture-cost-audit`. The baseline main commit is `80af0a6ca9067396c99a8443fad4eff8e1d51ff2`; the first cleanup commit is `c6dc5ce057b2d535b7484a5283d10be91c84dda0`.
2. Do not merge or deploy before September 11, 2026, 00:00 UTC (05:30 IST). Check for intervening changes, passing required checks and conflicts. Preserve branch protection and the compact/medium/wide visual release gate.
3. Merge the validated PR into main using the normal protected-branch path. Main validation automatically starts production deployment. Never bypass failed checks or deploy a different commit.
4. The production workflow captures a small read-only baseline from up to six published reviews whose legacy imports are complete. This also verifies that D1 accepts queries after reset. The baseline may fail if the account has already exhausted its new allowance; that stops deployment.
5. Before uploading the Worker, `apply-read-efficiency.mjs` checks the exact database binding and required tables. It obtains a Time Travel bookmark, copies only migration 0008 into a temporary migration directory and applies it through Wrangler. It uses the existing `d1_migrations` history. This supports installations whose earlier tables were created outside Wrangler without pretending those earlier migrations ran.
6. The additive migration creates totals/revision tables, triggers and indexes. It backfills vote totals and verifies agreement with canonical votes. The prior Worker remains compatible with the added schema. If migration or verification fails, do not deploy the new Worker.
7. Deploy the compiled, validated Worker. Compare sampled D1 metadata, run the four-page/API/reaction smoke checks, then audit deployed content once. Report failures honestly, including whether the new Worker was already deployed when a post-deploy check failed.

Existing production/preview deploy commands both prepare migration 0008. Future schema migrations still need explicit review and a rollout plan. Preview shares live stores and is not a disposable data sandbox.

## Measurements and interpretation

`check-d1-reads.mjs before` records original SQL from commit `80af0a6`, not an inferred visitor count. `after` runs the optimized equivalents for the same sample. On later redeployments the original SQL remains the comparison baseline, even if the prior deployment already contains the optimizations.

The workflow summary shows actual D1 `meta.rows_read`, `rows_written`, SQL statement counts and whether returned data fingerprints match for:

- Single-review legacy import checks.
- A review's public reaction snapshot.
- A six-card Cafe refresh (or the available smaller sample).
- Two approved comments for the selected review.

Probes are read-only and retain no comment text, author names or visitor/voter IDs. A changed fingerprint during deployment may reflect concurrent legitimate activity and must be investigated before claiming an equivalent-work comparison. These are sampled query measurements, not complete Worker-request instrumentation or an overall saving percentage. Cold initialization, legacy import, personal-cookie merging, writes and dashboard cache hit rate are outside the probes. Migration/backfill work is separate.

The tests verify 18 → 3 warm SQL statements and six → one HTTP request per six-card Cafe refresh. They also verify a one-row revision lookup for unchanged warm dashboard polls, invalidation after source writes, and expiry when views leave the rolling date window. None of those local tests substitutes for live billed-row measurements.

Cloudflare bills rows examined, and indexes/triggers add writes. Monitor both the 5,000,000 daily reads and 100,000 daily writes; reduced SQL counts alone do not establish quota safety. Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [D1 metrics](https://developers.cloudflare.com/d1/observability/metrics-analytics/).

## Existing monitoring

The existing **Movie site quota report** automation is enabled for 09:00 and 21:00 IST, six reports over three days, beginning September 11. It uses `ops/free-quota-monitor`, workflow `cloudflare-usage-monitor.yml`, and bootstrap run `34520499662`. Preserve that branch and automation; do not create a duplicate monitor.

The latest verified report before this rollout was fetched September 10 at 19:28 UTC: 5,015,475 account/site rows read and 1,499 rows written in the current UTC day. This confirms the recorded read allowance was exhausted. Analytics may lag or be sampled; this is not an availability probe or proof that a specific query caused the outage.

Use subsequent reports to compare completed UTC days or equivalent elapsed periods, noting the successful deployment SHA and time. Do not compare a reset counter directly with the previous day's cumulative total and call that an optimization saving. Keep the existing scoped analytics token private; the monitoring setup records a seven-day expiry from September 11 IST.

## Recovery

If preparation fails, the old Worker stays deployed. If the new Worker fails smoke checks, inspect the specific failure and recover using the last known good Worker version after assessing the error. The additive schema can remain for an old-code rollback; do not drop tables or automatically restore the whole database, which could discard new legitimate activity. The Time Travel bookmark is available for an explicitly assessed data-recovery need.

## Validation recorded before merge

- 63 automated tests pass, including migration backfill, vote changes/rollback/cascade, bounded query plans on 3,000 reviews, batch API validation, stale Cafe responses and exact dashboard visitor/window behavior.
- Astro checks: zero errors, zero warnings, one existing clipboard deprecation hint.
- Production and preview bundles build; both Wrangler dry-runs pass.
- All eight migrations apply successfully to an isolated local D1 database. Fixture import integrity checks pass.
- The local runtime rendered the four room pages from isolated copied content for visual checking. Cloud Browser rejected opening the local preview file under its URL security policy. Compact/medium/wide visual checks are therefore **not passed**. Do not treat static HTML generation or the automated tests as visual approval; complete this release gate through an allowed preview/review path before merging.
