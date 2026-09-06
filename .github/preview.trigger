Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-06: Build the Auditorium v4 artwork-first runtime from the confirmed
content/v4/responsive assets. Use 02-08 as the normal page flow, reserve 09 as
the same-canvas Theater focus state and 10 as the same-canvas Share Your Opinion
exit state. Use a consistent 1.5rem visual vertical gap between all normal
Auditorium sections by excluding each artwork file's measured transparent
canvas from document flow. The Auditorium background is intentionally not wired
while its artwork is still being finalized. Do not use old Content geometry or
guessed asset filenames. The Lounge and The Movie Café are intentionally
unchanged.

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
