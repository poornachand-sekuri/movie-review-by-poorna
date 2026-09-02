# Cloudflare Staging Topology

## Safety rule

The rebuild staging environment must not receive write bindings to current production storage.

## Resource names

- Worker: `movie-review-by-poorna-staging`
- D1 database: `movie-review-by-poorna-staging-db`
- Staging R2 bucket: `movie-review-by-poorna-staging-assets`

Use the D1 `apac` location hint when the database is provisioned unless measured traffic later shows a materially better primary location.

## Existing production review media

Existing posters/gallery URLs already published under `https://assets.moviereviewbypoorna.com/reviews/...` are consumed as public read-only URLs during the rebuild.

The staging Worker must not receive the production `movie-review-assets` R2 binding. This prevents Admin or test code from accidentally modifying current review media.

## New UI artwork

New AVIF artwork and any Admin upload tests belong in the staging R2 bucket until launch approval.

Recommended UI namespace:

```text
ui/site/v1/
├── shared/
├── lobby/
│   ├── compact/
│   ├── medium/
│   └── wide/
├── screening-room/
│   ├── compact/
│   ├── medium/
│   └── wide/
├── movie-cafe/
│   ├── compact/
│   ├── medium/
│   └── wide/
└── projection-booth/
    ├── compact/
    ├── medium/
    └── wide/
```

File names describe visual components, not device models. A new artwork revision gets a new versioned path rather than overwriting an immutable deployed asset.

## D1

The staging D1 database receives the versioned migrations in `migrations/` and a copied legacy-content seed only after migration verification tooling passes locally/CI.

No production review record is removed or rewritten as part of staging migration.

## Durable Objects

Reactions, comments and analytics used for staging tests must use namespaces belonging to the staging Worker. Production Durable Object state must not be shared with staging.

At final production cutover, preservation of existing production reaction/comment/analytics state will be treated as a separate migration/compatibility gate.

## Deployment

The branch deploy target is the staging Worker only. The production custom domain is not attached during development.

A production deployment command/configuration is intentionally absent from this branch until launch approval.
