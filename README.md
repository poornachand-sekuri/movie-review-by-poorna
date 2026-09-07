# Movie Review By Poorna — Cinema Rebuild

`cinema-rebuild` is the development branch for the new responsive cinema experience. The current production site remains untouched until the rebuild is explicitly approved for cutover.

## Cinema spaces

- Home — **The Lounge**
- Individual review — **The Auditorium**
- Search — **The Movie Café**
- Admin — **The Projection Booth** (to be built later)

Routes stay conventional (`/`, `/review/[slug]`, `/search`) while the room names describe the user-facing experience.

## Current technical foundation

- Astro + TypeScript application layer
- Cloudflare Workers runtime
- D1 database: `movie-review-by-poorna-content`
- R2/custom-domain artwork served from `assets.moviereviewbypoorna.com`
- Premium runtime artwork uses WebP; archival master formats stay outside normal page delivery
- D1 stores canonical review data, movie reactions and the rebuilt moderated comments system
- New public comments are stored as `pending`; only `approved` comments are returned publicly

## Runtime ownership

The implementation intentionally keeps responsibilities separated:

- `src/pages/` — route composition and server-side page data
- `src/layouts/` — shared document shell
- `src/lib/data/` — D1 queries and mutations
- `src/lib/*-assets.ts` — confirmed artwork URLs and intrinsic dimensions
- `src/lib/*-focus.ts`, `*-reactions.ts`, `comments-client.ts` — browser interaction controllers
- `src/styles/` — artwork registration, room-specific presentation and shared UI presentation
- `migrations/` — append-only D1 schema history
- `scripts/` — validation and deterministic migration utilities
- `.github/workflows/` — validation and preview deployment only

See `docs/ARCHITECTURE.md` for the detailed maintenance map.

## Development rules

1. Approved artwork is the visual source of truth.
2. HTML owns semantic content and accessibility.
3. CSS owns registration, layout and viewport/container adaptation.
4. TypeScript owns contracts, data access and interaction logic.
5. Do not guess artwork dimensions or overlay geometry.
6. Do not modify Production/Main as part of rebuild work.
7. Keep migrations additive; do not rewrite migration history after it has been applied.
8. Delete one-off diagnostic workflows and temporary trigger files after they have served their purpose.

## Validation

Use:

```bash
npm run validate
npm run build
```

`npm run validate` runs runtime guardrails, Lounge loading tests and Astro/TypeScript checks.

The preview workflow also smoke-tests D1 APIs, The Lounge, The Movie Café, Auditorium click-through and required runtime artwork before a deployment is considered successful.

## Deployment

Changes to runtime/application paths on `cinema-rebuild` automatically deploy to the temporary Worker:

`https://movie-review-by-poorna-preview.poornarocks.workers.dev`

The deployment workflow is path-based; there is no manual trigger-file editing requirement.

## Data status

- 136 review records were migrated and verified against the legacy catalogue.
- Review detail, credits, gallery data and full-text search are served from D1.
- Like/Dislike totals are movie-specific and persisted in D1.
- The rebuilt comments model supports `pending`, `approved` and `rejected` moderation states.
- Existing publicly approved Production comments are preserved without modifying Production data.

Before changing infrastructure or data contracts, also read:

- `docs/ENGINEERING-GUARDRAILS.md`
- `docs/DATA-MIGRATION.md`
- `docs/CLOUDFLARE-DEPLOYMENT.md`
