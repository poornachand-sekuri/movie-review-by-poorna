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
