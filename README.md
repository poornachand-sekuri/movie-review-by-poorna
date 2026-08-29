# Movie Review By Poorna

Production website source for Movie Review By Poorna.

## Production architecture

- GitHub is the source of truth.
- Cloudflare Workers deploy the site with `npx wrangler deploy`.
- `wrangler.jsonc` uses `src/worker-v2.js` as the Worker entrypoint and serves static assets from `public/`.
- `src/worker-v2.js` adds moderated comments and delegates the review/Admin API to `src/worker.js`.
- Cloudflare R2 bucket `movie-review-assets` stores managed review data, comments and uploaded review assets.
- The finalized Home and Content artwork is hosted from `https://assets.moviereviewbypoorna.com/master/`.

## Current public runtime

`public/index.html` loads the active site stack:

- `assets/styles.css`
- `assets/master-background.css`
- `assets/desktop-authoritative.css`
- `assets/mobile-v2.css`
- `assets/typography-cinematic.css`
- `assets/mobile-v2-theater.css`
- `assets/review-editorial.css`
- `assets/comments.css`
- `assets/review-data-bridge.js`
- `assets/app-v4.js` on desktop / non-V2 routes
- `assets/desktop-authoritative.js` on desktop / non-V2 routes
- `assets/mobile-v2.js` on supported mobile Home and review routes
- `assets/comments.js`

## Admin runtime

`public/admin/index.html` loads:

- `admin/admin.css`
- `admin/admin-comments.css`
- `admin/admin.js`
- `admin/admin-comments.js`

## Reference source files

Files under `source/` are reference metadata and are not deployed as public assets. Keep them only when they document or support the current master artwork/content structure.

## Cleanup rule

Do not keep versioned trial files in `public/` once a newer production file has replaced them and no live page references them. Production visual or API behavior should never be changed as part of a cleanup-only commit.
