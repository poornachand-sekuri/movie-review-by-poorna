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
    // Begin downloading a section roughly one screen before it becomes visible.
    root: null,
    rootMargin: '90vh 0px 90vh',
    threshold: 0.01,
  });

  deferred.forEach((element) => observer.observe(element));
}

/** Called only after the page's controls, carousels and event handlers exist. */
export function prepareLounge(page: HTMLElement): void {
  let generation = 0;

  // Do this immediately. Lower sections are no longer allowed to compete with
  // the first screen for bandwidth, but will still be warm before scrolling.
  armProgressiveArtwork(page);

  const prepare = async () => {
    if (document.documentElement.dataset.loungeState !== 'loading') return;
    const current = ++generation;
    page.setAttribute('aria-busy', 'true');

    /*
     * Critical-only readiness gate.
     *
     * The old loader waited for the full Lounge background, every section frame,
     * every poster in both carousels, and even the second carousel pages before
     * revealing anything. That made a premium image-heavy page feel broken on
     * mobile. The Lounge now opens as soon as its immediately usable first UI is
     * paintable: Top Navigation, Now Reviewed frame, featured poster and fonts.
     * The 7.25 MB Lounge background and lower sections continue in parallel and
     * progressively appear without blocking interaction.
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
