# Whole-site refactor audit

Baseline: main commit `65edf623e0034cd61c5b7c657fb4fba2d8af1df8`. Work is isolated on `site-refactor-performance`.

## Scope and method

Reviewed authored page templates, browser controllers, server routes, SQL/data services, styles, configuration, migration/import scripts, tests, documentation and all three deployment workflows. Traced imports, event handlers, data shapes and stylesheet precedence before removing code. Generated dependency/runtime files and binary artwork were inventoried; they were not rewritten or claimed as application logic reviewed line by line.

Approved images, dimensions, palettes, transparency and registered panel coordinates remain unchanged. Existing migrations and legacy Durable Object exports remain intact. No live data, R2 objects or production deployment was changed during this refactor.

## Findings and changes

| Area | Finding | Change |
| --- | --- | --- |
| Lounge | Invalid observer margin could strand deferred posters | Use supported pixel margins; retain restored-scroll and no-observer behavior |
| Lounge | Page script mixed into a long template; obsolete comment submit handler | Separate page controller; retain the working shared comments handler |
| Lounge | Two layers of styles and superseded declarations | One stylesheet; remove 79 superseded declarations; verify final exact-selector/media/importance values against baseline |
| Shared styles | Room-specific patches and unused starter tokens loaded globally | Move sharing styles to Auditorium; move footer artwork into Lounge; remove unused shell and 27 unused tokens |
| Shared scripts | Comments and Auditorium sharing ran on every public page | Initialize controllers only on their owning pages |
| Auditorium | Sequential independent reads and repeated initial reaction request | Parallel reactions/related reads; use SSR snapshot initially; refresh restored pages |
| Reactions | An old refresh could overwrite a newer vote | Discard stale snapshots using a request revision |
| Café | Cards existed only after JavaScript; query URL was ignored | Render first six matching cards on the server; share one escaped card renderer and query state |
| Café | Search text rebuilt for each filter/page operation | Index once; cache filtered/sorted results across pagination |
| Projector Room | Dashboard ran a paginated no-op reaction sync | Fetch live D1 analytics directly; retain manual refresh and compatibility API |
| Projector Room | Review list fetched every full review body | Opt-in compact list; detail fetched on edit; old API contract still available |
| Projector Room | Per-credit/per-image database round trips; partial saves on failure | One six-statement transactional save for review, credits and gallery |
| Data ownership | One large admin module; duplicate moderation/helpers | Separate reviews, moderation and analytics; remove unused superseded moderation functions; share normalization/origin/JSON helpers |
| Analytics | Page-view writes inspected comment schema; duplicate aggregate scans | Independent analytics schema initialization; combine total/distinct-visitor scan |
| Auth | Malformed encoded cookies could throw | Fail closed with regression coverage |
| Lounge SQL | Two correlated legacy-audit probes per sorted row | One indexed join; preserve imported/new review ordering and paging |
| Deployment | Preview command could use production config; workflows duplicated checks | Explicit target/config selection, compiled-target verification, shared smoke/import scripts |
| Deployment | Manual production path lacked validation | Validate manual main deployments; keep exact validated-commit deployment for automatic runs |
| Documentation | Described retired branches, workflows, art format and unimplemented admin | Document the existing four rooms and current three-workflow deployment model |

## Measured work reduction

An isolated SQLite harness executed the actual baseline and refactored SQL using the same input: 120 credits, 30 gallery images, and a populated review body.

| Measurement | Baseline | Refactored |
| --- | ---: | ---: |
| Database binding calls for an update including reload | 401 | 6 |
| SQL statements for that update | 401 | 11 |
| Admin list bytes for a single long-body fixture | 51,395 | 995 with compact mode |
| Full admin list contract without compact mode | 51,395 bytes | 51,395 bytes |
| Initial Auditorium client reaction reads | 1 | 0; SSR state retained |
| Café search-text construction | Per review on each filter/page pass | Once per catalogue item |
| Production Worker upload from CI | 715.13 KiB (178.46 KiB gzip) | 727.24 KiB (181.62 KiB gzip) |

These are operation/payload measurements, not claims about a percentage improvement in live response time. Network latency and production traffic must be measured after a preview deployment. Image transfer sizes are unchanged. The Worker bundle is slightly larger with server-rendered Café cards and the shared renderer; this is a server deployment size, not a browser download size.

The save transaction follows [Cloudflare's documented D1 batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/). JSON table inputs keep parameter and statement counts bounded within [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Verification

- Automated loading, Café sorting/filtering/render escaping, reaction freshness, admin save/rollback, auth, moderation, analytics and Lounge ordering tests.
- Actual SQL runs against isolated SQLite with all six migrations applied.
- Fixture importer: 1 review, 4 credits, 2 gallery items; FTS, integrity and foreign-key checks.
- Static comparison confirms final Lounge declaration values for every exact selector/media/importance combination match baseline. This is not a substitute for browser visual review.
- [GitHub CI run 34172980438](https://github.com/poornachand-sekuri/movie-review-by-poorna/actions/runs/34172980438) passed on implementation commit `2768ec1`: 25 tests, Astro/TypeScript (zero errors/warnings), production and preview builds, and both deployment dry-runs.
- Preserved production catalogue import passed: 136 reviews, 698 credits, integrity/foreign-key checks.
- Shared deployment smoke tests cover all four pages, auth boundaries, public APIs, indexing and required Lounge WebP artwork.

Local Cloudflare builds were interrupted by environment network approval cancellation. GitHub CI completed both build checks successfully for this branch. Live preview smoke tests and compact/medium/wide visual review require deploying this branch; they have not been claimed as completed.

## Intentionally retained

- Append-only migrations and source-hash import audit data.
- Runtime schema setup required for existing databases, including comment soft deletion.
- `ReactionStore`, `CommentsStore`, `AnalyticsStore` exports protecting legacy namespace/deployment compatibility.
- Public API routes, response fields, approved sharing copy, clipboard fallback, comment moderation/rate limiting, archive behavior and media ownership checks.
- All existing artwork and the approved full-width Auditorium/clapboard layout.
- Three workflows with distinct jobs: validation, manual preview, validated-main production.
