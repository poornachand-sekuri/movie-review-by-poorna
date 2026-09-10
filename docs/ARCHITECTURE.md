# Architecture and ownership

## Document shell

`src/layouts/SiteFrame.astro` owns document metadata, global styles, preload hints and first-party analytics. It does not initialize room-specific sharing or comments. `global.css` and `tokens.css` contain shared primitives only.

## Lounge

`src/pages/index.astro` selects 17 compact reviews and renders the featured/recent/previous panels. `src/lib/lounge.ts` owns carousels, focus controls and title animation. `lounge-loading.ts` progressively releases lower posters; the inline `LoungeLoading.astro` component owns first-screen readiness and recovery timers.

`src/styles/lounge.css` is the single Lounge stylesheet. Its established cascade preserves normal, focused and narrow-screen geometry. Edit the owning declaration rather than adding another override file. `lounge-assets.ts` defines critical images used by both the loader and head preloads. CSS owns structural frames.

## Auditorium

`src/pages/review/[slug].astro` renders one review. Once it resolves the review, it loads reaction state and related reviews concurrently.

Browser controllers have separate responsibilities: `auditorium-focus.ts`, `auditorium-reactions.ts`, `auditorium-sharing.ts` and the shared `comments-client.ts`. The SSR reaction snapshot is initial state; confirmed writes, cross-tab notifications, focus/restored-page refreshes and a 15-second visible-page refresh keep it current. New clients submit explicit reaction state so retries do not invert a vote.

Styles are scoped by feature: core registration in `auditorium.css`, then navigation, focus, reactions, sharing and comments styles. Approved top-wall artwork and the continuous lower seating remain unchanged. The clapboard and theater fill the available viewport width; other panels retain their registered proportions.

## Movie Café

`src/pages/search.astro` loads a compact D1 catalogue, renders the first six filtered cards on the server and embeds escaped catalogue JSON for local filtering. Review bodies are excluded.

`cini-cafe-filter.ts` owns search normalization, date precedence and sorting. It indexes searchable text once and reuses results across pagination. `cini-cafe-card.ts` is the escaped HTML renderer shared by SSR and browser updates. `cini-cafe.ts` owns controls, pagination, title fitting and restored-page reaction refreshes. `/search?q=...` initializes both server and browser search state.

## Projector Room

`src/pages/admin/index.ts` authenticates on the server before returning `src/admin/projector-room.html`. Unauthenticated visitors receive only the login document. `public/admin/admin.js` handles the editor, dashboard, moderation and uploads; `admin.css` owns its existing appearance.

The admin list requests `?compact=1` and loads full review text only when a review is opened. Legacy list callers can omit that option to retain the original response shape and full body. Dashboard totals are read directly from D1 on dashboard entry, date-range changes, explicit Refresh actions and relevant admin mutations. They do not poll or refresh on browser focus, visibility changes, cross-tab votes or history restoration: recalculating historical analytics repeatedly consumes the shared daily D1 read allowance. Public review voting and count synchronization remain independent. The old sync API remains available for compatibility.

## Data and HTTP boundaries

Quota-sensitive reads use the existing indexes to restrict work to the requested records. The legacy-reaction import check has separate single-review and full-catalogue predicates; a nullable-parameter OR must not turn per-review reaction refreshes into catalogue scans. The full-catalogue path remains available for pending imports, and completed imports retain their durable markers.

Related-review candidates drive the final review lookup by primary key. SQLite's explicit `CROSS JOIN` fixes that loop order so the published-status index cannot make the final join visit every published review. Credit priority, credit position, recency, ID tie-breaking, publication filtering and language/general fallbacks are preserved. See [SQLite's join-order documentation](https://www.sqlite.org/optoverview.html#manual_control_of_query_plans_using_cross_join).

September 10 query metrics supplied by the owner show 41,490 legacy-import checks reading 5.73 million rows and 10,245 credit-based related-review queries reading 2.07 million rows. These are reported query totals; the screenshots do not establish a separate UTC-day breakdown or distinguish visitors, preview traffic and automated audits. The dashboard's four traffic aggregates shown total about 32,480 rows, so removing dashboard polling alone does not address the dominant consumers. Local query-plan regression tests cover the two targeted lookups; production row-read savings must be measured after deployment.

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
