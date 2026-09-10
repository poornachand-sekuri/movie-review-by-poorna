# Prelaunch engagement reset

The owner requested a fresh start on September 10, 2026: remove existing likes/dislikes, comments (all moderation states, including soft-deleted rows) and page-view history. Keep every review, rating, POV, credit, gallery item and R2 image. This is a separately executed data operation, not an automatic migration or deployment step.

## Target and order

- Database: `movie-review-by-poorna-content`, ID `6c88b16c-c302-47cf-92cd-bdc5f8470bc2`, binding `CONTENT_DB` in `wrangler.jsonc`.
- Production and preview share this database; both will show the reset.
- Apply the new additive indexes in migration 0008 before deploying the accompanying code to both Workers through the existing required checks. Index construction is an explicit operation, not a page-request task. The code removes automatic legacy imports/identity reconciliation, reaction polling and per-filter Café requests. The existing dashboard change also removes periodic analytics requests.
- Before changing data, keep a private D1 export or Time Travel recovery bookmark. Do not commit backups or credentials. The namespace compatibility exports and historical Durable Object storage remain retained but are no longer consulted by application requests. No legacy comment import script should be rerun after this reset.
- Run the reset once, after D1 access resumes. An exhausted daily allowance cannot be replenished by deleting rows. Do not repeatedly attempt the operation while D1 rejects queries.

## Execute with authorized Cloudflare access

From the repository root, using the existing Cloudflare operator credentials:

```bash
npx wrangler d1 time-travel info CONTENT_DB --config wrangler.jsonc
npx wrangler d1 execute CONTENT_DB --remote --config wrangler.jsonc --file migrations/0008_targeted_review_reads.sql
```

After deploying the code and verifying both Workers, execute the separately authorized reset:

```bash
npx wrangler d1 execute CONTENT_DB --remote --config wrangler.jsonc --file operations/reset-prelaunch-engagement.sql
```

Alternatively, execute the complete SQL file in the selected database's Cloudflare Console. The SQL's single reset INSERT and its trigger form an atomic operation; a failure leaves the engagement rows and reset marker unchanged. Preparatory table/trigger creation is harmless if interrupted. It does not rely on several independent DELETE requests completing successfully.

The result reports removed vote/comment/view counts and preserved review count. Verify that review content is unchanged, the three engagement totals are zero before new activity, and both public/admin surfaces display the fresh totals. Close/reload old browser tabs to replace previously loaded counters and timer code. New visits immediately begin adding new views; test visits on preview currently count too because the data store is shared.

The fixed `prelaunch-2026-09-10` marker makes an accidental retry a no-op, including after new activity. Do not delete the marker, change its key or run the trigger body on its own. The operation keeps ID sequences and existing legacy vote completion markers; it adds missing markers for every existing review so old import code cannot resurrect archived votes. It does not create or modify reviews.

## Database usage after deployment

Initial page loads obtain current counts. A vote's successful write response updates the current page; same-browser cross-tab notifications and back/forward-cache restoration can request fresh counts. Idle tabs and focus changes issue no scheduled reaction requests. Café searches, filters, sorting and pagination use the loaded catalogue. Other visitors' later votes become visible when the page is reloaded or otherwise refreshed. Comments still require moderation and page views are recorded once per page load, with no timer. Dashboard Refresh/date changes continue to request up-to-date totals.

Query-plan and request-behavior tests verify the changed work pattern locally. Measure production D1 rows read after release; do not infer an unlimited capacity or guaranteed daily budget from empty tables.

## Individual-review lookup checks

The test fixture contains 3,000 reviews. Public slug and admin ID reads seek a unique index/primary key; cast, gallery and vote queries use only that review's indexed children. Public comments have separate review/Lounge predicates and indexes matching their complete display order, so they stop at the requested limit. Related Reviews excludes already-selected IDs in SQL and fetches only its remaining slots; same-language recency uses the new compound index. Normal catalogue browsing and dashboard totals intentionally span multiple reviews. Confirm the corresponding `EXPLAIN QUERY PLAN` output on D1 after applying 0008; physical D1 row counts include supporting index/related-record reads and are not guaranteed to equal one for an entire review page.
