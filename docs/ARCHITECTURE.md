# Architecture and ownership

## Document shell

`src/layouts/SiteFrame.astro` owns document metadata, global styles, preload hints and first-party analytics. It does not initialize room-specific sharing or comments. `global.css` and `tokens.css` contain shared primitives only.

## Lounge

`src/pages/index.astro` selects 17 compact reviews and renders the featured/recent/previous panels. `src/lib/lounge.ts` owns carousels, focus controls and title animation. `lounge-loading.ts` progressively releases lower posters; the inline `LoungeLoading.astro` component owns first-screen readiness and recovery timers.

`src/styles/lounge.css` is the single Lounge stylesheet. Its established cascade preserves normal, focused and narrow-screen geometry. Edit the owning declaration rather than adding another override file. `lounge-assets.ts` defines critical images used by both the loader and head preloads. CSS owns structural frames.

## Auditorium

`src/pages/review/[slug].astro` renders one review. Once it resolves the review, it loads reaction state and related reviews concurrently.

Browser controllers have separate responsibilities: `auditorium-focus.ts`, `auditorium-reactions.ts`, `auditorium-sharing.ts` and the shared `comments-client.ts`. The SSR reaction snapshot is initial state; successful writes and restored-page refreshes keep it current.

Styles are scoped by feature: core registration in `auditorium.css`, then navigation, focus, reactions, sharing and comments styles. Approved top-wall artwork and the continuous lower seating remain unchanged. The clapboard and theater fill the available viewport width; other panels retain their registered proportions.

## Movie Café

`src/pages/search.astro` loads a compact D1 catalogue, renders the first six filtered cards on the server and embeds escaped catalogue JSON for local filtering. Review bodies are excluded.

`cini-cafe-filter.ts` owns search normalization, date precedence and sorting. It indexes searchable text once and reuses results across pagination. `cini-cafe-card.ts` is the escaped HTML renderer shared by SSR and browser updates. `cini-cafe.ts` owns controls, pagination, title fitting and restored-page reaction refreshes. `/search?q=...` initializes both server and browser search state.

## Projector Room

`src/pages/admin/index.ts` authenticates on the server before returning `src/admin/projector-room.html`. Unauthenticated visitors receive only the login document. `public/admin/admin.js` handles the editor, dashboard, moderation and uploads; `admin.css` owns its existing appearance.

The admin list requests `?compact=1` and loads full review text only when a review is opened. Legacy list callers can omit that option to retain the original response shape and full body. Dashboard reactions are read directly from D1; no client sync loop is necessary. The old sync API remains available for compatibility.

## Data and HTTP boundaries

- `reviews.ts`: compact lists, full review detail, FTS and credit matches.
- `related-reviews.ts`: credit-first, same-language, then general-recency fallback.
- `cini-cafe.ts`: compact catalogue and searchable credit names.
- `reactions.ts`: persisted viewer votes and totals.
- `comments.ts`: public approved comments, pending submissions and rate limiting.
- `admin-reviews.ts`: validated edits and atomic review/credits/gallery saves.
- `admin-comments.ts`: soft deletion, moderation queues and counts.
- `analytics.ts`: first-party views and dashboard aggregates.

Schema initialization remains where needed for existing databases. The comment soft-delete column is an intentional runtime upgrade described in migration 0006. Analytics setup is independent of comment schema inspection. Do not remove these compatibility paths merely because migration files also contain table definitions.

API routes validate HTTP inputs, enforce authentication/origin boundaries and call the data layer. `admin/values.ts`, `http/json.ts` and `http/origin.ts` own shared normalization/response behavior.

## Deployment and validation

The three workflows are documented in `CLOUDFLARE-DEPLOYMENT.md`. `scripts/cloudflare.mjs` chooses and verifies the Worker target; `smoke-site.mjs` shares live checks between preview and production. `check-importer.mjs` tests all migrations and retained import data without requiring a system SQLite installation.

Before publishing, run `npm run validate`, build/dry-run both configurations, and complete preview smoke tests. Production additionally requires visual checks at representative compact, medium and wide viewports. Avoid deleting migrations, compatibility exports or external API routes based only on an absence of current internal imports.
