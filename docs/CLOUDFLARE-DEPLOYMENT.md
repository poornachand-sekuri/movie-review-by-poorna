# Cloudflare Deployment Model

## Goal

Keep the rebuild safe without maintaining duplicate production/staging data infrastructure.

## Temporary preview

During development, `cinema-rebuild` deploys to the temporary Worker name `movie-review-by-poorna-preview` and a workers.dev test URL. The current live Worker/domain stays untouched until launch approval.

This preview Worker is temporary code isolation, not a permanent second environment.

## D1

Use one content database only:

- Database: `movie-review-by-poorna-staging-db`
- Binding: `CONTENT_DB`

The database name reflects when it was created, but it is the single canonical D1 database planned for the new site. Do not create a second production D1 database at cutover.

After approval, the production Worker binds to this same database.

## R2 and AVIF artwork

Do not create a second R2 bucket merely for the rebuild. Reuse the existing `movie-review-assets` bucket, with new artwork stored under a separate immutable namespace so old review media cannot be overwritten accidentally.

Recommended namespace:

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

Never overwrite a deployed immutable AVIF when its visual content changes; publish a new versioned path.

## Existing review media

Existing posters and review images remain at their existing R2/public URLs. No copying is required unless a future measured requirement justifies it.

## Optional services

No Cloudflare Images runtime binding and no KV session store are enabled by default. Additional Cloudflare services are added only when they solve a demonstrated requirement and their cost/performance impact has been reviewed.

## Cutover

At launch:

1. Keep the same D1 database.
2. Keep the same existing R2 media store.
3. Point the approved production Worker/domain at the new code and the same content database.
4. Remove the temporary preview Worker after final verification.

This gives us safe development isolation without paying the complexity cost of permanently duplicated infrastructure.
