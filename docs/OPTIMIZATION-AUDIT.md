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

## Current architecture observations

- Review/UI images are already externalized to the owned R2 domain and are AVIF where applicable; the Git repository itself is not carrying a large local image payload.
- `/data/index.json` is dynamically assembled by the Worker so Admin-managed additions/updates remain visible. It intentionally bypasses the normal static-asset path.
- Home and Cine Cafe currently consume the full dynamic review catalog even though they do not require full review-body HTML. A future compact dynamic catalog endpoint is a meaningful payload optimization, but it should be implemented and regression-tested as a separate change because it touches Worker data routing.
- CSS is deliberately layered (`site.css`, `final-overrides.css`, navigation, Home polish/comments, Cine Cafe special). Consolidation could reduce requests but is higher visual-regression risk and should only be done with screenshot comparison across the finalized mobile viewport matrix.
- Cloudflare static assets are revalidated by default. Aggressive browser caching has not been enabled because several current asset URLs are not content-hashed; long immutable caching would risk repeat visitors receiving stale CSS/JS after a release.

## Next optimization candidates, in priority order

1. Add a dynamic compact catalog endpoint for Home/Cine Cafe while keeping full `/data/index.json` for review pages and Admin compatibility.
2. Benchmark CSS consolidation after capturing baseline mobile screenshots for Home, Content, and Cine Cafe.
3. Introduce systematic content-hashed/versioned frontend assets before applying long browser-cache TTLs.
4. Consolidate production smoke workflows only after verifying that failure isolation and deployment timing remain equivalent.
5. Add performance budgets for critical request count and frontend payload size to CI once baseline measurements are captured.

## Merge policy

Do not merge this branch to `main` until branch validation is green and the Home, Content, and Cine Cafe mobile pages have been visually checked against the current production baseline.
