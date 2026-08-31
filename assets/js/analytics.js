function pageIdentity() {
  const url = new URL(location.href);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/cine-cafe')) {
    return { pageType: 'cine-cafe', pageKey: '/cine-cafe/', slug: null };
  }
  const review = url.searchParams.get('review');
  if (review) {
    return {
      pageType: 'review',
      pageKey: `/?review=${encodeURIComponent(review)}`,
      slug: review
    };
  }
  if (path === '/') return { pageType: 'home', pageKey: '/', slug: null };
  return { pageType: 'other', pageKey: path, slug: null };
}

export async function trackPageView() {
  if (location.pathname.startsWith('/admin')) return;
  const identity = pageIdentity();
  try {
    await fetch('/api/analytics/pageview', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        ...identity,
        title: document.title || ''
      })
    });
  } catch {
    // Analytics must never interfere with the public experience.
  }
}

const run = () => queueMicrotask(trackPageView);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
else run();
