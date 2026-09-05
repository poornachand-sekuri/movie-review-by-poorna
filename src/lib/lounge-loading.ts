/** Extract the browser-selected artwork URLs, including multiple backgrounds. */
export function backgroundImageUrls(background: string): string[] {
  return [...background.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
    .filter(Boolean);
}

/** A network load alone is insufficient: wait until the bitmap can be painted. */
export async function waitForImage(image: HTMLImageElement): Promise<void> {
  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
      };
      const loaded = () => { cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('Lounge image failed to load.')); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    });
  }
  if (image.naturalWidth === 0) throw new Error('Lounge image is unavailable.');
  if (typeof image.decode === 'function') await image.decode();
}

function removeLegacyArtworkRequests(page: HTMLElement): void {
  /*
   * These nodes were retained from the old AVIF implementation but are hidden
   * by CSS and are no longer painted. Browsers can still start downloading an
   * <img> even when it is display:none, which means they can waste bandwidth
   * alongside the actual CSS WebP artwork. Remove them immediately and clear
   * the obsolete inline background URL so only the current R2 WebPs remain.
   */
  page.querySelector<HTMLElement>('.lounge-backdrop')?.removeAttribute('style');

  page.querySelectorAll<HTMLImageElement>('.lounge-panel__art').forEach((image) => {
    image.removeAttribute('src');
    image.removeAttribute('srcset');
    image.remove();
  });
}

function armProgressiveArtwork(page: HTMLElement): void {
  const deferred = [
    ...page.querySelectorAll<HTMLElement>(
      '.lounge-panel--recent, .lounge-panel--previous, .lounge-panel--opinion, .lounge-panel--bottom',
    ),
  ];

  if (deferred.length === 0) return;

  if (typeof IntersectionObserver === 'undefined') {
    deferred.forEach((element) => element.classList.add('is-art-ready'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      if (element instanceof HTMLElement) element.classList.add('is-art-ready');
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: '90vh 0px 90vh',
    threshold: 0.01,
  });

  deferred.forEach((element) => observer.observe(element));
}

/** Called only after the page's controls, carousels and event handlers exist. */
export function prepareLounge(page: HTMLElement): void {
  let generation = 0;

  removeLegacyArtworkRequests(page);
  armProgressiveArtwork(page);

  const prepare = async () => {
    if (document.documentElement.dataset.loungeState !== 'loading') return;
    const current = ++generation;
    page.setAttribute('aria-busy', 'true');

    /*
     * Critical-only readiness gate.
     *
     * Open the Lounge when the immediately usable first UI is paintable: Top
     * Navigation, Now Reviewed frame, featured poster and fonts. The large
     * Lounge background and lower sections continue independently instead of
     * blocking the first interaction.
     */
    const artworkUrls = new Set<string>();
    page.querySelectorAll<HTMLElement>(
      '.lounge-stage > .lounge-panel--banner:not(.lounge-panel--bottom) .lounge-banner-crop, .lounge-stage > .lounge-panel--now',
    ).forEach((element) => {
      backgroundImageUrls(getComputedStyle(element).backgroundImage).forEach((url) => artworkUrls.add(url));
    });

    const artwork = [...artworkUrls].map((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'high';
      image.src = url;
      return image;
    });

    const featuredPoster = page.querySelector<HTMLImageElement>('.now-poster img');
    if (featuredPoster) {
      featuredPoster.loading = 'eager';
      featuredPoster.fetchPriority = 'high';
    }

    const jobs: Promise<void>[] = artwork.map(waitForImage);
    if (featuredPoster) jobs.push(waitForImage(featuredPoster));
    if (document.fonts) jobs.push(document.fonts.ready.then(() => undefined));

    let loaded = 0;
    let reportedFailure = false;

    const reportProgress = () => {
      if (current !== generation) return;
      document.dispatchEvent(new CustomEvent('lounge:loading-progress', { detail: { loaded, total: jobs.length } }));
    };

    reportProgress();

    const results = await Promise.allSettled(jobs.map((job) => job.then(() => {
      loaded += 1;
      reportProgress();
    }, (error: unknown) => {
      if (current === generation && !reportedFailure) {
        reportedFailure = true;
        document.dispatchEvent(new Event('lounge:loading-error'));
      }
      throw error;
    })));

    if (current !== generation || results.some((result) => result.status === 'rejected')) return;
    document.dispatchEvent(new Event('lounge:assets-ready'));
  };

  const start = () => { void prepare().catch(() => document.dispatchEvent(new Event('lounge:loading-error'))); };
  document.addEventListener('lounge:resume-loading', start);
  start();
}
