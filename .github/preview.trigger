Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-07: Refine the Auditorium Theater reading experience without changing
approved artwork geometry. In the normal Theater, move the live review viewport
up to source y=140 on the 1448x1086 canvas and end it at source y=675. This
reduces the empty space above the first review line to approximately one reading
line and preserves approximately one full reading-line of breathing room above
the baked big-screen prompt. Keep the review internally scrollable.

Focused Theater uses the approved 09 alternate artwork and keeps the review in a
fixed safe viewport inside the Theater screen: left=120/1448, top=180/1086,
width=1208/1448, height=610/1086. Add A-minus and A-plus readability controls
visible only in focused Theater mode. Support five bounded font-size levels from
small through extra large. Changing font size must never change the physical
review viewport; larger text only increases the internal scroll height, so text
cannot overlap or extend beyond the Theater screen frame, seats, reactions or
EXIT artwork. Disable the decrease/increase control at the respective limits and
keep keyboard accessibility. Preserve the chosen size while the current page is
open. Existing focus close behavior remains: baked EXIT hit area, backdrop click
or Escape, restoring the section to its original page position.

Keep all previously approved Auditorium mapping: consistent 1.5rem visible gaps;
source-measured Clapboard overlays; Watched In = language; stars-only rating;
full posters resized with object-fit: contain; Related Reviews ordered by
Director, Actor, Actress, Music Director matches then same-language/general
fallbacks; Related titles inside their red poster openings on subtle black strips;
and the improved My POV typography. The Auditorium background remains unwired
while its artwork is being finalized. The Lounge and The Movie Café are
intentionally unchanged.

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
