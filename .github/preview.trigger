Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-06: Deploy the first responsive Auditorium v4 runtime. Use the newly
uploaded content/v4/responsive artwork as immutable visual layers, align live
review data over the approved Clapboard/Theater/Related sections, preserve the
theater screen's internal scroll surface, and keep the page on the existing
/review/[slug] routes.

2026-09-06: Deploy the exact-palette replacements for 06 Share Your Opinion and
09 Share Your Opinion With Exit. Use the newly uploaded runtime Q99 files and
fresh cache keys so the preview cannot retain any previous palette versions.

2026-09-06: Deploy the exact-palette replacement for 07 Lounge / Cini Cafe banner.
Use the newly uploaded `07_Lounge_Cini_Cafe_Banner_runtime_q99.webp` and force a
fresh asset cache key so the preview cannot retain the previous banner pixels.

2026-09-06: Final Auditorium naming audit passed at the application gate; deploy the
fully cleaned room identity to the temporary preview Worker for live verification.

2026-09-06: Lock the individual Review page identity as The Auditorium. Keep all
review routes unchanged, use the Auditorium loader theme/artwork naming, and keep
The Lounge / The Auditorium / The Movie Café / The Projection Booth as the canonical
one-theater page identities.

2026-09-06: Connect the approved transparent 09 Share Your Opinion With Exit
artwork in focus mode. Align its two comment slots and lower form to the image,
and map the top-right EXIT tab to the accessible close button. Keep the normal
06 ticket in the Lounge. Version both runtime URLs to bypass replaced asset caches.

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
