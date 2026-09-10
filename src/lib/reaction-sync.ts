const CHANGE_KEY = 'mrp:reaction-change';

export function publishReactionChange(slug: string): void {
  try {
    localStorage.setItem(CHANGE_KEY, JSON.stringify({ slug, nonce: crypto.randomUUID() }));
  } catch {
    // The current page already has the confirmed write; a reload updates other tabs.
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
  // Back/forward cache restores stale HTML without a new server render.
  window.addEventListener('pageshow', (event) => { if (event.persisted) whenVisible(); });
}
