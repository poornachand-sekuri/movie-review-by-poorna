# V3 Runtime Architecture

This document is the source of truth for the live frontend runtime.

## Rule

Each page owns exactly one base renderer/style plus one canonical runtime/style override. Do not add `*-fix`, `*-polish`, `*-fidelity`, `*-final`, or numbered patch layers to an entrypoint. Fold future corrections into the canonical files below.

## Home / Lounge

Loaded by `assets/js/bootstrap-home-v3.js` when there is no `review` query parameter.

- Base visual/layout stylesheet: `assets/css/home-v3.css`
- Canonical layout stylesheet: `assets/css/home-v3-stable.css`
- Base renderer/data loader: `assets/js/home-v3.js`
- Canonical behavior/fitting/popover runtime: `assets/js/home-v3-runtime.js`
- Shared comments API/runtime: `assets/js/comments.js`

The Home master AVIF sections under `https://assets.moviereviewbypoorna.com/ui/pages/home/v3/mobile` remain the visual source of truth.

## Content / Review

Loaded by `assets/js/bootstrap-home-v3.js` when `?review=<slug>` is present.

- Base stylesheet: `assets/css/content-v3.css`
- Canonical layout stylesheet: `assets/css/content-v3-stable.css`
- Base renderer: `assets/js/content-v3.js`
- Mobile asset-path normalizer: `assets/js/content-v3-asset-path.js`
- Canonical POV/navigation/comments behavior: `assets/js/content-v3-runtime.js`
- Reactions: `assets/js/live-reactions.js`
- Comments: `assets/js/comments.js`

The Content V3 mobile AVIFs remain the visual source of truth.

## Cini Cafe

Loaded by `cine-cafe/index.html`.

- Base stylesheet: `assets/css/cine-cafe.css`
- Canonical layout stylesheet: `assets/css/cine-cafe-stable.css`
- Canvas scaler: `assets/js/cine-cafe-scale.js`
- Base renderer/filter/pagination runtime: `assets/js/cine-cafe.js`
- Canonical navigation/card-link/live-like runtime: `assets/js/cine-cafe-runtime.js`

The Cini Cafe V3 master AVIF remains the visual source of truth.

## Regression-prevention rules

1. A selector affecting POV, movie-card title/rating, reaction count, or navigation must have one canonical owner per page.
2. Do not attach a ResizeObserver to the same text element from more than one module.
3. Do not use `visualViewport.resize` for font fitting; mobile browser chrome changes viewport height without changing the component box.
4. Home popup typography is derived from the normal rendered typography and scaled by the actual section enlargement ratio.
5. Long Home movie titles use a single-copy slow ticker with an explicit blank restart interval. No duplicate marquee copies are allowed.
6. All current UI artwork must use the V3 R2 paths. Legacy Content V2 runtime/artwork is not part of the live site.
7. Any future cleanup or UI change must update this document and the validation workflow together.
