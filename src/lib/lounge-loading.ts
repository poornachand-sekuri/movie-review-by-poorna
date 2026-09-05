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
      // Check again after subscribing, including cached and failed requests.
      if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    });
  }
  if (image.naturalWidth === 0) throw new Error('Lounge image is unavailable.');
  if (typeof image.decode === 'function') await image.decode();
}

/** Called only after the page's controls, carousels and event handlers exist. */
export function prepareLounge(page: HTMLElement): void {
  let generation = 0;

  const prepare = async () => {
    if (document.documentElement.dataset.loungeState !== 'loading') return;
    const current = ++generation;
    page.setAttribute('aria-busy', 'true');
    const artworkUrls = new Set<string>();
    page.querySelectorAll<HTMLElement>('.lounge-backdrop, .lounge-stage .lounge-panel, .lounge-stage .lounge-banner-crop')
      .forEach((element) => {
        backgroundImageUrls(getComputedStyle(element).backgroundImage).forEach((url) => artworkUrls.add(url));
      });

    // Warm every real poster, including off-screen rows and second carousel pages.
    // Hidden legacy .lounge-panel__art images are not the artwork painted by CSS.
    const posters = [...page.querySelectorAll<HTMLImageElement>('.now-poster img, .recent-card__poster img, .previous-card img')];
    posters.forEach((image) => { image.loading = 'eager'; });
    const artwork = [...artworkUrls].map((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      return image;
    });
    const jobs = [...artwork, ...posters].map(waitForImage);
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

  // Return visits use the browser cache but still verify actual readiness.
  const start = () => { void prepare().catch(() => document.dispatchEvent(new Event('lounge:loading-error'))); };
  document.addEventListener('lounge:resume-loading', start);
  start();
}
