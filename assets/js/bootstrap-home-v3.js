const url = new URL(location.href);
const hasReview = url.searchParams.has('review');
const pathParts = url.pathname.split('/').filter(Boolean);
const isHome = !hasReview && pathParts.length === 0;

if (isHome) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/assets/css/home-v3.css?v=20260831-master-v3';
  document.head.append(css);
  import('./home-v3.js');
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
