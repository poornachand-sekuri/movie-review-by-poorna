# Movie Review By Poorna

Astro and TypeScript on Cloudflare Workers, with D1 content and R2 artwork.

| Room | Route | Responsibility |
| --- | --- | --- |
| Lounge | `/` | Featured, recent and previous reviews; audience comments |
| Auditorium | `/review/[slug]` | Review, cast, verdict, reactions, sharing and related reviews |
| Movie Café | `/search` | Search, filters, sorting and paginated review cards |
| Projector Room | `/admin/` | Authenticated editing, media uploads, moderation and analytics |

Production: [moviereviewbypoorna.com](https://www.moviereviewbypoorna.com).
Preview: [preview Worker](https://movie-review-by-poorna-preview.poornarocks.workers.dev).

## Local development

Use the Node version in `.nvmrc` and install pinned dependencies with `npm ci`.

```bash
npm run dev
npm run validate
npm run build
npm run build:preview
```

`validate` runs code/artwork/auth guardrails, behavioral regression tests and Astro/TypeScript checks. Tests use an isolated SQLite database and never write live data.

## Deployment

Three workflows have separate responsibilities:

- **Validate Application** checks pull requests and main, builds both Worker configurations, dry-runs each bundle, and verifies migrations plus the preserved legacy import.
- **Deploy Preview** runs manually on the selected branch, then checks all four pages, public APIs, admin access boundaries and artwork.
- **Deploy Production** deploys the exact main commit after validation succeeds. A manual production run checks out main and validates it first.

Local deployment commands are `npm run deploy:preview` and `npm run deploy:production`. Both validate and build the chosen target before publishing. The deployment script refuses a compiled Worker with the wrong target name. Neither command rewrites the production configuration.

Preview and production share D1 and R2; preview isolates code, not user data. Preview pages are marked noindex.

## Maintenance

Approved artwork, its proportions and overlay coordinates are the visual source of truth. Text and controls remain semantic HTML. Page-specific scripts and styles belong to their page; data queries belong to `src/lib/data`.

Migrations are append-only. Preserve the compatibility Durable Object exports in `src/worker.ts`; deleting them can affect historical deployments and stored namespaces.

- [Architecture and ownership](docs/ARCHITECTURE.md)
- [Deployment configuration](docs/CLOUDFLARE-DEPLOYMENT.md)
- [Engineering guardrails](docs/ENGINEERING-GUARDRAILS.md)
- [Data migration history](docs/DATA-MIGRATION.md)
- [Refactor audit and verification](docs/REFACTOR-AUDIT.md)
