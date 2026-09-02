# Movie Review By Poorna — Fresh Rebuild

This branch is a clean implementation. Existing production frontend code is reference-only and must not be copied into this branch.

## Architecture priorities

1. Visual Quality
2. Cross-device layout quality
3. Performance
4. Maintainability

## Site concept

Movie Review By Poorna is designed as one virtual movie theater with connected spaces:

- Home: The Lobby
- Individual Review: The Screening Room
- Search: The Movie Café
- Admin: The Projection Booth

All pages share one cinematic design language while each space retains its own purpose and mood.

## Technical foundation

- Astro + TypeScript for the application layer.
- Cloudflare Workers for edge rendering and APIs.
- One D1 database for canonical structured review content after verified migration.
- The existing R2 media store is reused with isolated, versioned paths for new AVIF UI artwork.
- Durable Objects remain the interaction-state mechanism for reactions, comments and analytics unless measurements justify a different design.

## Cost-conscious deployment model

- No permanent staging/production data duplication.
- `cinema-rebuild` deploys temporarily to `movie-review-by-poorna-preview` while the current live site remains untouched.
- The single D1 database currently created as `movie-review-by-poorna-staging-db` becomes the content database for the new site; a second production D1 database will not be created.
- At cutover, the approved production Worker will bind to the same D1 database and the temporary preview Worker can be removed.
- No Cloudflare Images or KV runtime dependency is enabled.
- Additional paid services or duplicated storage are not introduced without an explicit cost/performance review.

## Current status

- The branch contains no production frontend implementation from `main`.
- D1 schema migrations and deterministic legacy import tooling are present.
- Automated validation covers TypeScript, Astro build, Cloudflare dry-run, migration/import smoke tests and database integrity.
- The preserved and current live catalogues have been reconciled at 136 reviews with no differences at the time of audit.
- No real review content has been copied into D1 yet.
- Production `main` and existing review media remain untouched.

## Implementation rules

- AVIF artwork provides cinematic appearance and visual framing.
- HTML owns semantic content and accessibility.
- CSS owns layout, sizing, spacing and adaptation across viewport/container sizes.
- TypeScript is mandatory for application contracts and logic.
- Client-side JavaScript is minimized and justified per interaction.
- Review content and existing review media are migrated as data, never by copying old UI implementation.
- Production `main` remains untouched until the rebuild is explicitly approved.

See `docs/ENGINEERING-GUARDRAILS.md` and `docs/DATA-MIGRATION.md` before adding page implementation or changing the content model.
