# Optimization Audit

Branch: `optimize/code-workflow-files`
Baseline: `main` at `3c18094ab4c33a5c79a0794418d5b5014c68a682`
Backup: `backup/main-2026-09-01`

## Guardrail

The finalized mobile UI is the compatibility baseline. Optimization work must not change layout geometry, copy, navigation behavior, review data semantics, reactions/comments behavior, Admin behavior, or production deployment unless explicitly approved.

## Implemented low-risk optimizations

- Added an early connection hint for the R2 artwork domain on Home/Content and Cine Cafe.
- Preload the Home master AVIF only on the Home route so the largest visual asset can begin downloading before Home review data finishes loading.
- Removed the second Cine Cafe analytics module load. The page already imports analytics from `cine-cafe.js`; loading the same module again with a different query-string URL could execute tracking twice.
- Pinned Wrangler to an exact version for reproducible Cloudflare validation/deployment behavior.
- Added a reusable `check:js` command covering all runtime JavaScript entry points/modules.
- Added a reusable `validate` command for syntax plus Cloudflare dry-run validation.
- Expanded branch CI coverage to the optimization branch, restricted workflow permissions to read-only contents, added stale-run cancellation, a timeout, and lower-noise npm installation.
- Added a compact dynamic review catalogue for Home and Cine Cafe while retaining the full review-body catalogue for Content pages and Admin compatibility.
- Added a CI regression check that preserves review ordering and compact fields while enforcing a minimum 25% serialized-payload reduction.
- Added a Content payload endpoint that combines the compact catalogue with only the requested review body/gallery, avoiding a full-catalogue body download on every Content page.
- Centralized all public dynamic data endpoints in `handleDynamicData` instead of splitting catalogue routing across Worker entry points.

## Current architecture observations

- Review/UI images are already externalized to the owned R2 domain and are AVIF where applicable; the Git repository itself is not carrying a large local image payload.
- `/data/index.json` is dynamically assembled by the Worker so Admin-managed additions/updates remain visible. It intentionally bypasses the normal static-asset path.
- Home and Cine Cafe consume `/data/catalog.json`. Content pages consume `/data/content.json?review=<slug>`, which returns the same compact catalogue plus the complete body/gallery for only the requested review. The compatibility endpoint `/data/index.json` remains available for existing integrations and Admin-backed data assembly.
- CSS is deliberately layered (`site.css`, `final-overrides.css`, navigation, Home polish/comments, Cine Cafe special). Consolidation could reduce requests but is higher visual-regression risk and should only be done with screenshot comparison across the finalized mobile viewport matrix.
- Cloudflare static assets are revalidated by default. Aggressive browser caching has not been enabled because several current asset URLs are not content-hashed; long immutable caching would risk repeat visitors receiving stale CSS/JS after a release.

## Next optimization candidates, in priority order

1. Benchmark CSS consolidation after capturing baseline mobile screenshots for Home, Content, and Cine Cafe.
2. Introduce systematic content-hashed/versioned frontend assets before applying long browser-cache TTLs.
3. Consolidate production smoke workflows only after verifying that failure isolation and deployment timing remain equivalent.
4. Extend performance budgets from catalogue payload size to critical request count and transferred frontend assets after baseline measurements are captured.

## Merge policy

Do not merge this branch to `main` until branch validation is green and the Home, Content, and Cine Cafe mobile pages have been visually checked against the current production baseline.
