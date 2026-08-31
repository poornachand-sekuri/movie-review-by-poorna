# Movie Reviews By Poorna

This branch contains the new mobile-first content-page frontend built from scratch around the finalized AVIF artwork.

## Data sources

The preserved review data remains authoritative and is not rewritten by the frontend:

- `public/data/index.json` — review/movie data
- `public/data/cast-crew.json` — actor, actress, director and music-director enrichment
- `public/data/related-review-rules.json` — Related Reviews ranking rules

## UI artwork

Production artwork is served from Cloudflare R2 through:

`https://assets.moviereviewbypoorna.com/ui/pages/content/v2/mobile/`

The exact filenames are configured in `assets/js/config.js`.

The R2 UI namespace is split by page type so Home and Content artwork stay separate:

- `ui/pages/home/...`
- `ui/pages/content/...`

Do not restore old frontend CSS/JS from `pre-clean-reset-backup-20260830` into this implementation.

## Current frontend behavior

- mobile-first content page
- finalized Top Logo/Header artwork
- clapboard top overlaps the body so the two assets read as one component
- poster is always `object-fit: contain`; no cropping
- Movie Title, language, release date, Cast & Crew, stars and My POV are live data
- Like/Dislike uses persistent shared counts through the same-origin `/api/reactions` endpoint
- Theater uses Top + stretchable Middle + Bottom/Seats
- review font size does not shrink for longer reviews
- no review scrollbar and no Read More
- Related Reviews are ranked from `cast-crew.json` + `related-review-rules.json`
- Related posters are contained within the reel windows
- fixed gap between Related Reviews and Share Your Opinion
- Comments artwork uses the final extra textarea-to-submit spacing

## Preview routing

A review can be opened with:

`/?review=<slug>`

If no slug is supplied, the newest record in `index.json` is shown.

## Likes / dislikes

Production reactions are persisted by `src/worker.js` using one SQLite-backed Cloudflare Durable Object per review slug.

- `GET /api/reactions?slug=<movie-slug>` returns shared Like/Dislike totals plus this browser's current vote.
- `POST /api/reactions` accepts `{ "slug": "...", "vote": "like" | "dislike" }`.
- a first-party voter cookie ensures repeated clicks from the same browser do not inflate totals.
- switching Like to Dislike (or vice versa) updates the existing vote instead of adding a second vote.
- `assets/js/live-reactions.js` migrates an existing browser-local preview vote into the shared store once, then removes the legacy local value.
- unknown review slugs are rejected against the live review catalog.

The Worker and static assets remain in the same Cloudflare deployment, so no cross-origin API configuration is required.

## Comments

Comment persistence/moderation is still intentionally separate and is not enabled by the reactions backend. `CONFIG.apiBase` remains blank for the existing comments preview flow.

See `docs/API-CONTRACT.md` for the intended comments API and moderation contract.

## R2 structure

See `docs/R2-ASSETS.md` before uploading or removing AVIF files.
