const CHANGE_KEY = 'mrp:reaction-change';

export function publishReactionChange(slug: string): void {
  try {
    localStorage.setItem(CHANGE_KEY, JSON.stringify({ slug, nonce: crypto.randomUUID() }));
  } catch {
    // Returning to the page still refreshes when storage is unavailable.
  }
}

export function watchReactionChanges(refresh: (slug?: string) => void): void {
  let timer: number | undefined;
  let pending = false;
  let pendingSlug: string | undefined;
  const schedule = (slug?: string) => {
    pendingSlug = pending && pendingSlug !== slug ? undefined : slug;
    pending = true;
    if (document.visibilityState === 'hidden' || timer !== undefined) return;
    // Focus and visibilitychange commonly describe the same return to a tab.
    timer = window.setTimeout(() => {
      timer = undefined;
      if (document.visibilityState === 'hidden') return;
      const changedSlug = pendingSlug;
      pending = false;
      pendingSlug = undefined;
      refresh(changedSlug);
    }, 50);
  };
  const whenVisible = () => { if (document.visibilityState !== 'hidden') schedule(); };
  window.addEventListener('storage', (event) => {
    if (event.key !== CHANGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue);
      if (typeof message.slug === 'string' && message.slug) schedule(message.slug);
    } catch { /* Ignore unrelated or malformed storage events. */ }
  });
  window.addEventListener('focus', whenVisible);
  document.addEventListener('visibilitychange', whenVisible);
  window.addEventListener('pagehide', () => { window.clearTimeout(timer); timer = undefined; });
  window.addEventListener('pageshow', (event) => { if (event.persisted) whenVisible(); });
}
