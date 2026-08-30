# Cloudflare R2 Asset Structure

## Do not delete the old AVIFs yet

Upload the finalized files into a new versioned folder first. Do not overwrite or delete the previous UI artwork before the new frontend is deployed and verified.

Recommended rollout:

1. Upload the finalized AVIFs to the new `v2/mobile` folder.
2. Verify every asset URL directly.
3. Deploy the `fresh-take-mobile-v2` frontend branch to a preview environment.
4. Test short, medium and very long reviews plus Related Reviews and Comments.
5. Switch production to the new frontend only after visual approval.
6. Keep the previous UI artwork for a rollback window.
7. Delete/archive old UI artwork only after production has been stable.

The existing movie posters/gallery paths must stay unchanged because `public/data/index.json` already points at them.

## Recommended R2 hierarchy

```text
assets.moviereviewbypoorna.com/
├── reviews/
│   └── {slug}/
│       ├── poster.jpg
│       └── gallery/
│           ├── 01.jpg
│           └── ...
│
├── ui/
│   └── content-page/
│       ├── v1/                  # previous UI, retain temporarily
│       │   └── ...
│       └── v2/
│           ├── mobile/
│           │   ├── 01-top-logo-header-LOCKED.avif
│           │   ├── 03-clapboard-top-LOCKED.avif
│           │   ├── 04-clapboard-body-NO-SCREW-PLATE-LOCKED.avif
│           │   ├── 05-like-dislike-interaction-frame-TALLER-LOCKED.avif
│           │   ├── 06-poster-frame-LOCKED.avif
│           │   ├── 07-theater-top-LOCKED.avif
│           │   ├── 08-theater-middle-stretchable-LOCKED.avif
│           │   ├── 09-theater-bottom-seats-LOCKED.avif
│           │   ├── 10-related-reviews-header-LOCKED.avif
│           │   ├── 11-related-reviews-film-reel-strip-LOCKED.avif
│           │   ├── 13-share-your-opinion-header-LOCKED.avif
│           │   └── 14-comments-horizontal-shell-SPACING-PATCH-LOCKED.avif
│           └── desktop/         # reserved for the later desktop phase
│
└── archive/                     # optional long-term archive area
    └── ui/
```

## Why version the folder instead of replacing files

- safe rollback
- browser/CDN caches cannot accidentally serve old pixels under a new design
- easier debugging because the URL tells us which design generation is being used
- desktop artwork can later be added without mixing it with mobile assets

## Caching

Because the UI files live under a versioned directory and are treated as immutable, use a long cache lifetime where possible:

```text
Cache-Control: public, max-age=31536000, immutable
```

If an artwork file needs another visual change after launch, create `v3` rather than silently replacing a `v2` file that may already be cached.

## Current frontend asset base

`assets/js/config.js` expects:

```text
https://assets.moviereviewbypoorna.com/ui/content-page/v2/mobile/
```

Upload the finalized AVIF ZIP contents into that exact folder before testing the branch visually.
