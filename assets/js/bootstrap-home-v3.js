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
const HOME_VERSION = '20260902-selected-cinema-lounge-6';

if (isHome) {
  [
    `/assets/css/home-v3.css?v=${HOME_VERSION}`,
    `/assets/css/home-v3-adjustments.css?v=${HOME_VERSION}`
  ].forEach(href => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = href;
    document.head.append(css);
  });

  HOME_ASSETS.slice(0, 3).forEach(file => {
    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = `${HOME_ASSET_BASE}/${file}?v=${HOME_VERSION}`;
    document.head.append(preload);
  });

  Promise.all([
    import(`./home-v3.js?v=${HOME_VERSION}`),
    import(`./home-v3-adjustments.js?v=${HOME_VERSION}`),
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
