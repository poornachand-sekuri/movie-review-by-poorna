Deploy the current cinema-rebuild branch to the temporary preview Worker.

2026-09-07: Build the Auditorium v4 artwork-first runtime from the confirmed
content/v4/responsive assets. Keep a consistent 1.5rem visible vertical gap
between all normal Auditorium sections. The Auditorium background remains
intentionally unwired while its artwork is being finalized. Do not use old
Content geometry or guessed asset filenames. The Lounge and The Movie Café are
intentionally unchanged.

Clapboard runtime mapping remains source-measured from the approved 1536x1024
artwork: poster inner opening x=75..553/y=164..492, metadata centres
y=253/351.5/446, credit centres y=607.877/654.438/700.396/748.993, and baked
colon axis x=373..377. Watched In maps to review.language. Rating shows stars
only. Runtime does not render credit labels. The Clapboard movie poster uses
object-fit: contain so the full poster is resized into the red opening rather
than cropped. My POV keeps its approved content-box geometry but now uses larger
condensed cinema-style typography, stronger weight, balanced wrapping and a
warmer readable ivory treatment without changing the artwork.

Related Reviews uses the four source-measured inner poster openings from the
2172x724 artwork: x=340..675, x=726..1061, x=1112..1446 and x=1497..1833 with
shared y=245..485. Posters use object-fit: contain. Each title sits inside its
same red poster opening at the bottom on a subtle translucent black strip.
Related selection order is Director match, Actor, Actress, Music Director,
de-duplicated and excluding the current review. If fewer than four credit
matches exist, fill only remaining slots with recent unrelated reviews,
preferring the same language first and then other recent reviews. Fallbacks
must never replace or reorder a credit match.

Implement Auditorium focus behavior using the approved alternate artwork states.
Theater/Now Screening uses 09_Theater_Focus_Overlay_transparent_runtime_q99.webp
as the focused replacement state; Share Your Opinion uses
10_Share_Your_Opinion_With_Exit_runtime_q99.webp. Opening focus moves the real
section into a modal focus stage while preserving its original page position,
dims/blurs the surrounding Auditorium and locks page scrolling. Sections open
by click or Enter/Space. Close through the baked EXIT hit area, backdrop click,
or Escape, then restore the original section and keyboard focus. The Theater
focus EXIT target is source-measured from approximately x=1161..1334/y=962..1054
on its 1448x1086 canvas. The Opinion EXIT target is source-measured from
approximately x=835..1000/y=12..88 on its 1080x1456 canvas. Focused Theater keeps
the live full-review internal scroll and enlarges the review typography. The
Opinion focus state currently provides the approved visual/Exit state; comments
input wiring remains a separate later runtime step.

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
