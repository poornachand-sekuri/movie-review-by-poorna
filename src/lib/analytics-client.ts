function pageIdentity(): { pageType: 'home' | 'review' | 'cine-cafe' | 'other'; pageKey: string; reviewSlug: string | null } {
  const path = window.location.pathname;
  if (path === '/') return { pageType: 'home', pageKey: '/', reviewSlug: null };
  if (path === '/search' || path === '/search/') return { pageType: 'cine-cafe', pageKey: '/search', reviewSlug: null };

  const reviewMatch = path.match(/^\/review\/([^/]+)\/?$/);
  if (reviewMatch?.[1]) {
    const slug = decodeURIComponent(reviewMatch[1]);
    return { pageType: 'review', pageKey: `/review/${slug}`, reviewSlug: slug };
  }

  return { pageType: 'other', pageKey: path.slice(0, 220) || '/', reviewSlug: null };
}

export function recordCinemaPageView(): void {
  const identity = pageIdentity();
  void fetch('/api/analytics', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(identity),
  }).catch(() => {
    // Analytics must never interfere with the visitor experience.
  });
}
