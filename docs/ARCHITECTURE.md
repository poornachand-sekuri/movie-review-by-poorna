# Rebuild Architecture Map

This document explains where a change belongs. The goal is to keep visual iteration fast without letting room-specific behavior leak across the application.

## Pages

### The Lounge — `src/pages/index.astro`

Owns Lounge server data and page composition. Lounge artwork configuration lives in `src/lib/lounge-assets.ts`; loading behavior lives in `src/lib/lounge-loading.ts` and `src/components/lounge/LoungeLoading.astro`. Lounge presentation is consolidated through `src/styles/lounge.css` and `src/styles/lounge-reset.css`.

### The Auditorium — `src/pages/review/[slug].astro`

Owns one review page and composes confirmed Auditorium artwork with live review data. Keep the route file focused on composition and server data selection.

Auditorium browser behavior is split by responsibility:

- `src/lib/auditorium-focus.ts` — popup/focus movement, close behavior and text-size controls
- `src/lib/auditorium-reactions.ts` — Like/Dislike browser state
- `src/lib/comments-client.ts` — public approved-comments rendering and pending submission UI

Auditorium styles are intentionally split by interaction area:

- `auditorium.css` — core artwork registration and content geometry
- `auditorium-navigation.css` — source-registered navigation hit areas
- `auditorium-focus.css` — focus-mode presentation and focus-only controls
- `auditorium-reactions.css` — reaction counters/hit targets
- `auditorium-comments.css` — Share Your Opinion live overlays

When changing a control, edit the narrowest owning stylesheet instead of adding a later override elsewhere.

### The Movie Café — `src/pages/search.astro`

Owns search-page composition. Search data comes from the shared review data layer/API rather than a separate catalogue.

### The Projection Booth

Not implemented yet. Future moderation UI should use the existing comments data model rather than creating a second comments store.

## Data layer

`src/lib/data/` is the only normal home for D1 business queries:

- `reviews.ts` — lists, detail, search-related review selection
- `reactions.ts` — movie-specific reaction snapshots and updates
- `comments.ts` — public approved reads, pending submissions and moderation-ready state helpers

Route handlers in `src/pages/api/` should validate HTTP input, call the data layer and shape the response. They should not duplicate SQL.

## Migrations

`migrations/` is append-only history. Do not edit an already-applied migration to change current behavior. Add the next numbered migration instead.

## Artwork

Runtime artwork URLs and dimensions belong in the room asset modules, not scattered through page files. Source-registered coordinates belong beside the component/feature that consumes them.

Do not introduce an alternate asset filename until the object has been confirmed in R2.

## Shared layout and comments

`src/layouts/SiteFrame.astro` owns the document shell, global metadata and shared style/runtime initialization.

`src/styles/comments.css` contains only presentation shared by Lounge and Auditorium comment cards/toasts. Artwork-specific comment geometry stays in the relevant room stylesheet.

## CI / deployment

Only two long-lived GitHub Actions workflows are expected for this branch:

- `validate-cinema-rebuild.yml` — guardrails, type/Astro checks, build and migration/import smoke tests
- `deploy-preview.yml` — validation, build, Worker deploy and live smoke tests

Geometry probes, asset inventories and one-time migration inspection workflows must be temporary and removed after use.

## Refactor safety checklist

Before deleting or moving a runtime module:

1. Verify its imports/usages.
2. Preserve route/API response contracts.
3. Preserve confirmed artwork geometry.
4. Run `npm run validate` and `npm run build`.
5. Let the preview workflow complete all live smoke tests.
6. Test the affected room on the preview URL.
