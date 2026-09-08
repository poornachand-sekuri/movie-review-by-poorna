const CHANGE_KEY = 'mrp:reaction-change';

export function publishReactionChange(slug: string): void {
  try {
    localStorage.setItem(CHANGE_KEY, JSON.stringify({ slug, nonce: crypto.randomUUID() }));
  } catch {
    // Focus/visibility and periodic refresh still work when storage is unavailable.
  }
}

export function watchReactionChanges(refresh: (slug?: string) => void): void {
  const whenVisible = () => { if (document.visibilityState !== 'hidden') refresh(); };
  window.addEventListener('storage', (event) => {
    if (event.key !== CHANGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue);
      if (typeof message.slug === 'string') refresh(message.slug);
    } catch { /* Ignore unrelated or malformed storage events. */ }
  });
  window.addEventListener('focus', whenVisible);
  document.addEventListener('visibilitychange', whenVisible);
  let timer: number | undefined;
  const start = () => {
    if (timer === undefined) timer = window.setInterval(whenVisible, 15000);
  };
  window.addEventListener('pagehide', () => { window.clearInterval(timer); timer = undefined; });
  window.addEventListener('pageshow', (event) => { start(); if (event.persisted) whenVisible(); });
  start();
}
