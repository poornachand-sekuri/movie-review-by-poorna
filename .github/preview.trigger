Deploy the current cinema-rebuild branch to the temporary preview Worker and run the existing live D1 API and Lounge page smoke tests.
Keep the locked Lounge data behavior unchanged: new published reviews added after the legacy migration come first by created_at, migrated legacy reviews remain ordered by reviewed_date descending, and the same sequence feeds Now Reviewed (#1), Recent Reviews (#2-#9), and Previously Reviewed (#10-#17) with the existing two-page swipe carousels and section interactions.
Presentation uses the 2026-09-05 Premier Lounge visual layer: full rendered cinema-lounge background, uploaded PNG section artwork, preserved navigation/review interactions, and one consolidated Lounge presentation stylesheet.
Premier Lounge PNG smoke tests are updated; redeploy this validated visual build.
Probe the uploaded Premier Lounge background filename and verify the complete R2 artwork set.
Use the verified Premier Lounge background object path resolved by the previous asset probe.
Lock Top Navigation, Now Reviewed, Recent Reviews, Previously Reviewed, Share Your Opinion, and Bottom Navigation to the same central architectural safe zone between the two vertical Lounge light rails.
Render the Premier Lounge background at full width without horizontal cropping, then align the complete UI stack to the light rails visible in that uncropped artwork.
In focus mode keep the Lounge background visible under a soft mask, remove the floating X, use the built-in EXIT artwork for Now Reviewed and Share Your Opinion, and retain outside-tap return behavior for panels without an EXIT graphic.
Use one dedicated clean full Lounge background image for every focus state so the backdrop never contains or changes with the underlying section stack.
Increase the complete Lounge section stack from 56vw to 64vw on phones so the panels are less compressed while retaining visible side architecture and common-width alignment for both navigation bars and all sections.
Preconnect and DNS-prefetch the R2 asset origin so Lounge artwork can start sooner while the production image payload is being optimized.
Restore the proven pre-reset runtime poster fitting: cover-fill each red poster window, remove mount gaps and padding, preserve the baked red border, and use the original decorative corner-mask technique re-measured for the current Premier PNG artwork.
2026-09-05 final asset cutover: use the exact uploaded 01_Movie_Reviews_By_Poorna_Premier_Lounge_Background.png as the runtime Lounge background on iOS/WebKit because the pixel-exact AVIF does not decode reliably there; keep the AVIF object stored for later optimization.
Keep the fixed background layer above the page fallback and below shade/content.
Runtime Now Reviewed right-leaf composition: keep the baked panel artwork unchanged; center the movie title horizontally in a refined metallic poster-title treatment aligned to the Reviewed By Poorna stamp axis, keep release date and language as smaller inward-facing vertical side credits, and center the cinema-gold rating directly below the stamp. Labels remain visually hidden while semantic values remain in the DOM.
Performance pass: serve the existing lossless WebP versions of Now Reviewed, Recent Reviews and Previously Reviewed instead of their larger PNG equivalents while keeping identical decoded pixels. Prepare a lossless WebP Lounge background cutover next to reduce the mobile first-load payload without changing any artwork.

Title visibility fix: render the Now Reviewed movie title in opaque bright ivory with an explicit WebKit text fill, no dark stroke or clipped-gradient treatment, and only a small proportional shadow. Preserve title placement and all artwork and metadata layout.

Lounge readability pass: use clean upright My POV typography with three lines inside the red frame, scroll only overflowing Recent Reviews titles within their own tickets, center and enlarge recent rating stars with reserved space, and tint Previously Reviewed posters in warm monochrome gold for a vintage film-reel look.

Rating color update: use bright champagne-ivory stars with a restrained warm gold glow in both Now Reviewed and Recent Reviews, preserving all rating sizes and alignment inside the red frames.

Carousel arrow placement: center both Previous and Next controls on the outer silver section borders in Recent Reviews and Previously Reviewed, using measured artwork coordinates that scale with the section while preserving poster windows and carousel behavior.
