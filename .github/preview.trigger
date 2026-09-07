Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-07: Keep the approved Auditorium artwork/content geometry and top/bottom
navigation mappings unchanged. Extend the existing Auditorium focus/layover system
to every content section except Top Navigation and Bottom Navigation. Focusable
sections are: Clapboard Details, Theater, Share This Review, Related Reviews and
Share Your Opinion. Theater keeps the approved 09 focus artwork, fixed internal
review viewport and external readability toolbar. Share Your Opinion keeps the
approved 10 focus artwork and baked EXIT hit area. Clapboard, Share This Review
and Related Reviews enlarge their existing approved artwork/content without
swapping or redrawing it and use one shared cinematic EXIT toolbar outside the
artwork. Related Review poster links remain interactive in focus mode. Keep Escape
and backdrop-click closing, page scroll locking, keyboard activation and exact
section restoration on close. Top and Bottom Navigation remain navigation-only
and must never open focus mode. The Auditorium background remains unwired while
its artwork is finalized. The Lounge and The Movie Café are otherwise unchanged.

Current Lounge invariants:
- Preserve the existing review ordering, routes, two-page carousels, swipe controls, focus behavior, opinion UI and 1rem Home section spacing.
- Use the nine Premium Runtime Q99 WebP Lounge assets in R2, including the approved upright 06 and 09 opinion tickets. Archival PNG/lossless/AVIF files are masters/backups only and must not be requested by the Lounge runtime.
- Keep all structural Lounge frames requested immediately and keep Recent/Previously Reviewed movie posters progressively scheduled at low priority.
- The featured Now Reviewed poster remains eager/high priority.
- On Home, preload the Lounge background, Top Navigation and Now Reviewed Q99 artwork from <head> at high priority.
- The Lounge loader must not reveal a cold-cache Lounge until those three critical visuals have loaded and, where supported, decoded so the backdrop is paint-ready on the first visible frame.
- Do not use a short time-based fast-reveal race that can bypass the Lounge background. The 10s recovery controls and 15s hard fail-open remain emergency safety guards only.
- Keep the mobile loader on lightweight CSS ambience so decorative loading artwork cannot compete with Lounge assets.
- Keep one consolidated Lounge presentation cascade: lounge.css imports lounge-reset.css; do not reintroduce retired split Lounge stylesheets, hidden artwork nodes, duplicate readiness gates or legacy asset URLs.
- Validate runtime guardrails, fast-loader behavior, current Q99 artwork, live D1 APIs, Cini Cafe and Auditorium review click-through before considering the deployment complete.
