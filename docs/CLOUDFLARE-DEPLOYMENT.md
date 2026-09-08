# Cloudflare deployment

## Targets

| Target | Source configuration | Worker | Public URL |
| --- | --- | --- | --- |
| Production | `wrangler.jsonc` | `movie-review-by-poorna` | https://www.moviereviewbypoorna.com |
| Preview | `wrangler.preview.jsonc` | `movie-review-by-poorna-preview` | https://movie-review-by-poorna-preview.poornarocks.workers.dev |

Both targets use the custom `src/worker.ts` entry, the `CONTENT_DB` binding to `movie-review-by-poorna-content`, and the `REVIEW_ASSETS` binding to `movie-review-assets`. Preview is code isolation; edits, reactions, comments and uploads use shared stores.

The Astro adapter receives `configPath` explicitly from `MRP_DEPLOY_TARGET`. The build script validates that target, generates the matching types, builds the app and verifies `dist/server/wrangler.json`. Deployment uses that compiled configuration and rejects mismatched Worker names/database bindings. Source configurations are never copied over one another.

## Workflows

1. `validate.yml`: on pull requests/main or manual invocation, run guardrails, behavioral tests and Astro checks; build and dry-run production and preview; verify all migrations and the fixture/legacy catalogue import.
2. `deploy-preview.yml`: manual on the chosen branch; validate, build preview, deploy preview, then smoke-test all four pages and APIs. The job summary includes direct test links.
3. `deploy-production.yml`: after successful main validation, deploy the exact validated commit. Manual execution always checks out main and validates before building. Production deployments are serialized.

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

The workflows call the same scripts. There are no trigger files, one-off patch workflows or automatic preview pushes. A successful merge into main starts validation and subsequently production deployment.

## Storage and media

D1 is authoritative for review content, reactions, comments and page-view analytics. R2 stores media and approved UI artwork at existing custom-domain URLs. Keep versioned immutable artwork paths and original image quality/transparency. No lossy conversion or image resizing is performed by this refactor.

Migrations are not automatically applied on deployment. Preserve migration history and use the documented data migration procedure for separately authorized schema changes. Retain the old Durable Object class exports for namespace/deployment compatibility; current requests use D1.

Preview pages carry `noindex,nofollow`; production public pages remain indexable. Admin documents and responses remain private/no-store.
