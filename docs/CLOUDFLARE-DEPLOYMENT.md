# Cloudflare deployment

## Targets

| Target | Source configuration | Worker | Public URL |
| --- | --- | --- | --- |
| Production | `wrangler.jsonc` | `movie-review-by-poorna` | https://moviereviewbypoorna.com |
| Preview | `wrangler.preview.jsonc` | `movie-review-by-poorna-preview` | https://movie-review-by-poorna-preview.poornarocks.workers.dev |

Both targets use the custom `src/worker.ts` entry, the `CONTENT_DB` binding to `movie-review-by-poorna-content`, and the `REVIEW_ASSETS` binding to `movie-review-assets`. Preview is code isolation; edits, reactions, comments and uploads use shared stores.

The Astro adapter receives `configPath` explicitly from `MRP_DEPLOY_TARGET`. The build script validates that target, generates the matching types, builds the app and verifies `dist/server/wrangler.json`. Deployment uses that compiled configuration and rejects mismatched Worker names/database bindings. Source configurations are never copied over one another.

## Workflows

1. `validate.yml`: on pull requests/main or manual invocation, run guardrails, behavioral tests and Astro checks; build and dry-run production and preview; verify all migrations and the fixture/legacy catalogue import.
2. `deploy-preview.yml`: manual on the chosen branch; validate, build preview, deploy preview, then run the bounded deployment check. Preview shares production D1 quota.
3. `deploy-production.yml`: after successful main validation, prepare migration 0008, deploy the exact validated commit, then run the bounded deployment check. Manual execution always checks out main and validates before building. Production deployments are serialized.

The routine post-deploy check (`check-deployment.mjs`) makes two GET requests: `/api/health` (no D1 query) and `/api/reviews?limit=1` (one compact list query). It verifies the service/environment and basic database access. It does not retry failures, write test votes, open all pages, or verify every interaction. Migration preparation still performs its small prerequisite/history checks; a newly applied migration also performs its required backfill and integrity verification. Therefore the complete deployment is not a zero-read operation.

Both workflows expose an **extended_checks** manual checkbox, default **false**. Selecting it runs the full live smoke checks, including temporary reaction writes. Production also runs the original/optimized SQL probes, aggregate verification and all-content audit. These diagnostics use the shared live quota and are for deliberate investigations; they do not run on automatic main deployments. Local behavioral tests, type checks, builds, migration/import verification and dry-runs remain in normal validation. Visual release checks remain required.

Required GitHub secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. The Projector Room uses Worker secrets `ADMIN_PASSWORD` and optionally `ADMIN_SESSION_SECRET` on each target. No secret values belong in Git.

## Commands

```bash
npm run validate
npm run build
node scripts/cloudflare.mjs production dry-run
npm run build:preview
node scripts/cloudflare.mjs preview dry-run
```

For an authorized deployment, use `npm run deploy:preview` or `npm run deploy:production`; each validates and builds first. `npm run preview` serves the most recently compiled app locally and does not publish it.

The deployment workflows call the same scripts. There are no trigger files, one-off patch workflows or automatic preview pushes. A successful merge into main starts validation and subsequently production deployment. The separately maintained `ops/free-quota-monitor` branch is used by the existing analytics report and must be retained.

## Storage and media

D1 is authoritative for review content, reactions, comments and page-view analytics. R2 stores media and approved UI artwork at existing custom-domain URLs. Keep versioned immutable artwork paths and original image quality/transparency. No lossy conversion or image resizing is performed by this refactor.

`scripts/cloudflare.mjs` now prepares the explicitly authorized migration `0008_read_efficiency.sql` before either target is deployed. Preparation verifies the expected database and prerequisite tables, captures a Time Travel restore bookmark, applies only that migration with Wrangler's standard migration tracking, and checks totals against canonical votes. It never replays historical migrations or applies future migrations automatically. A preparation failure stops Worker deployment. Existing migration history remains intact; subsequent deployments recognize the recorded migration and skip backfill. See `READ-EFFICIENCY-ROLLOUT.md` for details.

Retain the old Durable Object class exports for namespace/deployment compatibility. The read-only `LEGACY_REACTIONS` binding copies preserved votes once into D1; it must point at the original production ReactionStore namespace (preview uses `script_name`). Reaction schema initialization creates the import marker table safely on first use. New votes continue to use D1 only.

Preview pages carry `noindex,nofollow`; production public pages remain indexable. Admin documents and responses remain private/no-store.
