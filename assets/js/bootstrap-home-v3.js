const url = new URL(location.href);
const hasReview = url.searchParams.has('review');
const pathParts = url.pathname.split('/').filter(Boolean);
const isHome = !hasReview && pathParts.length === 0;

if (isHome) {
  const styles = [
    '/assets/css/home-v3.css?v=20260901-master-v3',
    '/assets/css/home-mobile-polish.css?v=20260901-home-comments-2',
    '/assets/css/home-comments.css?v=20260901-home-comments-2'
  ];

  styles.forEach(href => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = href;
    document.head.append(css);
  });

  import('./home-v3.js?v=20260901-home-comments-2')
    .then(() => import('./home-comments.js?v=20260901-home-comments-2'))
    .catch(error => console.error('Unable to load the Home page:', error));
} else {
  import('./app.js').then(async () => {
    const [, , comments] = await Promise.all([
      import('./ui-patch.js'),
      import('./live-reactions.js'),
      import('./comments.js')
    ]);
    comments.mountReviewComments();
  });
}
