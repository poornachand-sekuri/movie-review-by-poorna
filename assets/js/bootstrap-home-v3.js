const url = new URL(location.href);
const hasReview = url.searchParams.has('review');
const pathParts = url.pathname.split('/').filter(Boolean);
const isHome = !hasReview && pathParts.length === 0;

const HOME_ASSET_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/home/v3/mobile';
const HOME_ASSETS = [
  '01_background.avif',
  '02_top_menu_section.avif',
  '03_now_reviewed_section.avif',
  '04_recent_reviews_section.avif',
  '05_previously_reviewed.avif',
  '06_share_your_opinion.avif',
  '07_bottom_navigation.avif'
];

if (isHome) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/css/home-v3.css?v=20260901-lounge-redesign-1';
  document.head.append(css);

  // Preload the background and the first two visible shells. The remaining
  // authored section images are discovered immediately by home-v3.js.
  HOME_ASSETS.slice(0, 3).forEach(file => {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = `${HOME_ASSET_BASE}/${file}?v=20260901-lounge-redesign-1`;
    document.head.append(preload);
  });

  Promise.all([
    import('./home-v3.js?v=20260901-lounge-redesign-1'),
    import('./analytics.js')
  ]).catch(error => console.error('Unable to load the Home page:', error));
} else {
  import('./app.js').then(async () => {
    const [, , comments] = await Promise.all([
      import('./ui-patch.js'),
      import('./live-reactions.js'),
      import('./comments.js'),
      import('./analytics.js')
    ]);
    comments.mountReviewComments();
  });
}
