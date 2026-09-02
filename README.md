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
- D1 for canonical structured review content after verified migration.
- R2 for review media and versioned AVIF UI artwork.
- Durable Objects for interaction state such as reactions, comments and analytics unless measurements justify a different design.

## Current status

- The branch contains no production frontend implementation from `main`.
- The Astro/Cloudflare toolchain is pinned and isolated to the staging Worker name `movie-review-by-poorna-staging`.
- D1 schema migrations and deterministic legacy import tooling are present.
- Automated validation covers TypeScript, Astro build, Cloudflare dry-run, migration/import smoke tests and database integrity.
- No real review content has been copied into D1 yet.
- Production `main`, the current live catalogue and existing R2 review media remain untouched.

## Implementation rules

- AVIF artwork provides cinematic appearance and visual framing.
- HTML owns semantic content and accessibility.
- CSS owns layout, sizing, spacing and adaptation across viewport/container sizes.
- TypeScript is mandatory for application contracts and logic.
- Client-side JavaScript is minimized and justified per interaction.
- Review content and existing review media are migrated as data, never by copying old UI implementation.
- Production `main` remains untouched until the rebuild is explicitly approved.

See `docs/ENGINEERING-GUARDRAILS.md` and `docs/DATA-MIGRATION.md` before adding page implementation or changing the content model.
