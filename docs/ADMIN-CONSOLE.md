# Admin Console

The production Admin Console is served at `/admin/` and is intentionally separate from the public Home, Content and Cine Café interfaces.

## Cloudflare configuration

The Worker uses the existing production R2 bucket and custom domain:

- R2 binding: `REVIEW_ASSETS`
- bucket: `movie-review-assets`
- public asset base: `https://assets.moviereviewbypoorna.com`

Admin-uploaded images are written only below `reviews/{slug}/...`.

Two Worker secrets are required before interactive Admin login is enabled:

- `ADMIN_PASSWORD` — the password entered on `/admin/`
- `ADMIN_SESSION_SECRET` — a long random secret used to sign HttpOnly admin-session cookies

Do not commit either secret to GitHub or add them to `wrangler.jsonc`.

The older `ADMIN_COMMENTS_TOKEN` bearer token is still accepted for moderation API compatibility when configured, but the Admin Console itself uses the signed session-cookie login.

## Comments

The Comments tab reads the same central `CommentsStore` used by Home and review pages. Public comment endpoints return approved comments only.

Admin can:

- approve pending/rejected comments
- reject pending comments
- delete approved or other non-deleted comments
- filter Home vs Review comments

Commenter email remains available only to authenticated Admin requests.

## Traffic and reactions

Public Home, review and Cine Café pages submit first-party page-view events to the `AnalyticsStore` Durable Object.

The traffic implementation stores:

- day
- page type/key
- review slug/title when applicable
- aggregate view counts
- random first-party visitor ID for de-duplicated visitor counts

It does not store IP addresses.

Reaction counts remain authoritative in per-review `ReactionStore` objects. The Admin Dashboard can synchronize all review stores in batches into a global summary, so Likes/Dislikes can be viewed across reviews without changing public voting behavior.

## Review management

The repository's 136 preserved reviews remain the immutable base catalog. Admin edits are stored as R2 overrides in `_system/review-admin-v2.json`.

At runtime the Worker merges the base catalog with Admin overrides and deletions for:

- `/data/index.json`
- `/data/cast-crew.json`

Therefore Admin changes automatically flow into Home, Content pages, search, Related Reviews and Cine Café without editing several files.

Admin can:

- create a review
- edit every review field, including Cast & Crew
- upload/replace poster and gallery images
- remove images from a review
- explicitly delete R2 review images
- delete a review from the live catalog

Deleting a review does not automatically erase its R2 images. This is deliberate rollback protection; R2 image deletion is a separate confirmed action.
