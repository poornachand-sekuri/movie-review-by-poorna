Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-07: Keep all approved Lounge and Auditorium artwork geometry, focus modes,
navigation, review content mapping and movie-specific Like/Dislike behavior unchanged.
Add one shared moderated comments system across The Lounge and each Auditorium review.
Public users may submit a name and comment; every new submission must be stored in
D1 with status pending and must not appear publicly until approved by Admin later
through The Projection Booth. Public comments reads must return approved rows only.
The Lounge uses one Lounge-wide discussion target and reuses its existing approved
Share Your Opinion artwork, two Recent Comments slots, name field, comment field and
submit hit area. Auditorium comments are scoped strictly by review slug so each movie
has an independent thread, and its live overlays are source-registered separately to
approved Opinion artwork 07 and focus artwork 10. Focusing a Lounge or Auditorium
opinion field must retain typed content and open the readable focus ticket where the
existing interaction model already supports it. Show a clear awaiting-approval
confirmation after successful submission. Include a honeypot, duplicate suppression
and lightweight anonymous rate limiting without exposing any public moderation route.
The future Projection Booth must be able to consume the same pending/approved/rejected
D1 records without schema changes. The Auditorium background remains unwired while
its artwork is finalized. The Movie Cafe is otherwise unchanged.

2026-09-07 validation cutover: deploy from the corrected current comments client,
which preserves the dependency-free Lounge loader test path and uses DOM-safe comment
slot/form construction for both rooms.

2026-09-07 My POV refinement: keep the approved Clapboard artwork and My POV overlay
geometry unchanged, but render the POV as a left-aligned, warmer high-contrast reading
block with stronger condensed typography and improved small-screen readability.

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
