# Movie Reviews By Poorna — Fresh Take

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
- Like/Dislike uses live SVG Thumbs Up / Thumbs Down controls
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

## Likes and comments

The UI is ready for an API, but the production persistence backend is intentionally not faked.

Until `apiBase` is configured in `assets/js/config.js`:

- reactions use a browser-local preview fallback
- comments show that the moderation backend is not connected
- comment submissions are not sent anywhere

See `docs/API-CONTRACT.md` for the intended production API.

## R2 structure

See `docs/R2-ASSETS.md` before uploading or removing AVIF files.
