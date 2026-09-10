# Architecture and ownership

## Document shell

`src/layouts/SiteFrame.astro` owns document metadata, global styles, preload hints and first-party analytics. It does not initialize room-specific sharing or comments. `global.css` and `tokens.css` contain shared primitives only.

## Lounge

`src/pages/index.astro` selects 17 compact reviews and renders the featured/recent/previous panels. `src/lib/lounge.ts` owns carousels and focus controls. The shared `review-display.ts` owns title animation across rooms, including carousel visibility, reduced motion and removal of replaced cards. `lounge-loading.ts` progressively releases lower posters; the inline `LoungeLoading.astro` component owns first-screen readiness and recovery timers.

`src/styles/lounge.css` is the single Lounge stylesheet. Its established cascade preserves normal, focused and narrow-screen geometry. Edit the owning declaration rather than adding another override file. `lounge-assets.ts` defines critical images used by both the loader and head preloads. CSS owns structural frames.

## Auditorium

`src/pages/review/[slug].astro` renders one review. Once it resolves the review, it loads reaction state and related reviews concurrently.

Browser controllers have separate responsibilities: `auditorium-focus.ts`, `auditorium-reactions.ts`, `auditorium-sharing.ts` and the shared `comments-client.ts`. The SSR reaction snapshot is initial state; confirmed writes, cross-tab notifications, focus/restored-page refreshes and a 15-second visible-page refresh keep it current. New clients submit explicit reaction state so retries do not invert a vote.

Styles are scoped by feature: core registration in `auditorium.css`, then navigation, focus, reactions, sharing and comments styles. Approved top-wall artwork and the continuous lower seating remain unchanged. The clapboard and theater fill the available viewport width; other panels retain their registered proportions.

## Movie Café

`src/pages/search.astro` loads a compact D1 catalogue, renders the first six filtered cards on the server and embeds escaped catalogue JSON for local filtering. Review bodies are excluded.

`cini-cafe-filter.ts` owns the shared six-card page size, search normalization, date precedence and sorting. It indexes searchable text once and reuses results across pagination. `cini-cafe-card.ts` is the escaped HTML renderer shared by SSR and browser updates. `cini-cafe.ts` owns controls, pagination and reaction refreshes. Shared `review-display.ts` handles rolling titles; the obsolete three-line font fitter has been removed. `/search?q=...` initializes both server and browser search state.

## Projector Room

`src/pages/admin/index.ts` authenticates on the server before returning `src/admin/projector-room.html`. Unauthenticated visitors receive only the login document. `public/admin/admin.js` handles the editor, dashboard, moderation and uploads; `admin.css` owns its existing appearance.

The admin list requests `?compact=1` and loads full review text only when a review is opened. After a save, the editor reuses the returned canonical review and refreshes only the compact list. `admin.js` owns logout and reloads the server-authenticated route after the logout request settles. Legacy list callers can omit that option to retain the original response shape and full body. Dashboard reactions are read directly from D1 and refresh on focus, reaction notifications and every 15 seconds while visible. The old sync API remains available for compatibility.

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

## Preserved reactions

New review creation records a zero-vote migration marker in the same transaction as the review. A newly added review never inherits a preserved store from an older review that used the same slug. Editing a review retains its stable database ID and reactions, and updates its comments' target slug atomically. Public comment reads and duplicate checks use that stable review ID, including for records renamed before this repair. Regression tests cover creation, discovery across public surfaces, edits, slug reuse, reaction/comment isolation, and archiving using isolated SQLite data.

The original production `ReactionStore` namespace is read through the `LEGACY_REACTIONS` binding. Its binding-only RPC exports existing vote rows without modifying the old store. Each review is copied into D1 together with a `legacy_reaction_imports` completion marker in one transaction. Existing D1 votes win on identity conflicts; completed imports never replay, including after a reader removes a vote. A failed export remains retryable and is not silently treated as zero.

The Auditorium imports its review before reading or writing; Café and dashboard reads finish any remaining published-review imports first. Preview reads the production namespace by explicit `script_name`, and continues using the shared D1 store. No new active reaction store is introduced. Both `mrp_voter` (old) and `mrp_reaction_voter` (current) cookies are recognized; where both identify the same returning browser, its newer D1 choice takes precedence.

Production smoke checks exercise Like, idempotent retry, reload, independent visitor totals, switching, isolation, removal, and SSR/Café parity with a temporary random voter that is removed in `finally`. The deployment summary query reports only aggregate migration/count data, never voter identifiers.

## Query and cleanup audit, September 10, 2026

The fresh `refactor/architecture-cost-audit` branch starts at main `80af0a6`. Single-review legacy import checks now use a direct primary-key predicate; catalogue imports still cover all outstanding published reviews. Voting reuses the prepared reaction read after its write instead of checking the migration marker twice. Related-review lookup keeps the credit candidate set before primary-key review lookups, preserving role ranking and published-only filtering. No database migration is required for these changes.

The cleanup also removes 27 superseded Lounge declarations, an unused comment-status type and write-only admin analytics state. File-local types are no longer unnecessarily exported. Existing artwork, loading timings, POV fitting, API shapes, polling intervals, historical votes and release gates remain unchanged. No complete asset, migration or compatibility file was proven unused.

For a solo maintainer, the next cost improvements should be small: batch the six visible Cafe like-count reads; give public comments a matching indexed lookup; and limit related-review fallback reads to the missing slots. Keep exact dashboard unique-visitor semantics and local Cafe filtering. Preview currently shares production D1/R2 and the preserved reaction namespace, so use isolated local fixtures for development. A separate preview dataset is needed before using preview for disposable editorial changes.
