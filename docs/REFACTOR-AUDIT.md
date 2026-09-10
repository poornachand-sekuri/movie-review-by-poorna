# Whole-site refactor audit

## September 10 runtime cleanup

Baseline: main commit `80af0a6ca9067396c99a8443fad4eff8e1d51ff2`. Branch: `refactor/site-runtime-cleanup`.

The follow-up audit covers the Lounge, Auditorium, Café and Projector Room entrypoints, their shared controllers/styles, API and data-module references, public assets, scripts and deployment entrypoints. Changes are limited to confirmed duplication and unused code introduced or retained during subsequent feature work.

| Area | Confirmed finding | Cleanup |
| --- | --- | --- |
| Public movie titles | Lounge and shared display duplicated animation timing, measurement and listeners | One animation controller; one resize/motion/DOM refresh owner for recent, featured, Café and related titles |
| Dynamic display | Every body mutation restarted rolling titles; removed Café cards remained in the animation map | Ignore unrelated comment/reaction text changes, reuse unchanged animations, cancel removed tracks and release their resize observations |
| Café | The old three-line measuring clone and inline font fitter still competed with rolling titles | Remove the obsolete fitter and resize listener; preserve CSS typography and the no-JavaScript fallback |
| Café DOM/pagination | Repeated casts through `unknown`, manual child-removal helper and separately hardcoded server/client page size | Use typed DOM queries and native `replaceChildren`; share the six-card page size |
| Lounge CSS | Earlier dimensions, poster rules and focus styles were unconditionally superseded | Remove 35 shadowed declarations and merge five adjacent rules without moving surviving declarations |
| Projector Room | Injected capture-phase logout script suppressed a second logout handler; analytics state was never read | One logout handler retaining the protected-route reload, deduplicated repeated clicks and removed write-only state |
| Types | Five internal types were needlessly exported; one status alias had no consumers | Keep internal types local and remove the unused alias |

Verification:

- All 52 automated tests pass, including seven new title lifecycle and admin logout regression tests.
- `npm run validate` passes: naming/loading/artwork guardrails, tests, generated Worker types and Astro/TypeScript checks. Zero errors and zero warnings; the existing clipboard fallback produces one deprecation hint.
- Static CSS comparison confirms all 819 effective exact-selector/condition/property values match the baseline, including `!important` precedence. Lounge CSS shrinks from 29,928 to 28,621 bytes (1,268 to 1,187 lines).
- The production Astro/Cloudflare build completes successfully.
- This comparison checks the CSS cascade, not rendered pixels. Browser visual review has not been completed for this branch.

The file/reference audit did not establish that any remaining standalone file is safe to delete. All poster masks, geometry reference data, loading artwork, theatre scenery, migration/import scripts, public routes and deployed compatibility exports remain necessary. Their retention is deliberate. MY POV fitting and its approved panel geometry, artwork URLs, image palettes/transparency, APIs, database contents, authentication checks and mobile/desktop theatre styling remain intact. Production deployment is a separate step.

## Production quota incident during cleanup validation

At 2026-09-10 16:29 UTC, a temporary read-only diagnostic in [validation run 34502351118](https://github.com/poornachand-sekuri/movie-review-by-poorna/actions/runs/34502351118) returned Cloudflare D1 error 7500: the account exceeded its free daily row-read allowance. Production still ran main commit `80af0a6`; PR #87 had not been merged or deployed. Application validation and approved artwork verification passed, but the existing required live-content audit failed because the catalogue API returned HTTP 500.

[Cloudflare documents](https://developers.cloudflare.com/d1/platform/pricing/) a free allowance of five million rows read per day, counted by rows scanned, and a reset at 00:00 UTC. Site requests, dashboard polling and read-only live validation consume the same account allowance. Preview shares the production database. The exact contribution of each workload has not been measured, so this incident is not attributed to one of them.

A targeted follow-up removes the nullable-parameter OR from the per-review legacy-reaction import lookup. On an isolated SQLite fixture of 137 published reviews, `EXPLAIN QUERY PLAN` changes from a search of the published-status index to `SEARCH r USING INTEGER PRIMARY KEY (rowid=?)`. The catalogue-wide path remains available. Two regression tests cover the indexed lookup, original-slug/vote preservation, completed imports, draft/missing reviews and full-catalogue imports. All 54 tests and `npm run validate` pass locally, as does the production build. These are local query-plan results, not a measurement of total production usage or a guarantee that the free allowance is sufficient.

The temporary diagnostic is removed after recording its result. Required validation and deployment gates remain unchanged. Existing quota exhaustion requires the UTC reset or a user-authorized Workers plan upgrade; query improvements cannot restore consumed quota. Avoid repeated live audit attempts while the account remains over quota. Once access resumes, rerun required validation, merge normally, and verify the resulting production deployment and D1 usage.

## Earlier architecture refactor

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
