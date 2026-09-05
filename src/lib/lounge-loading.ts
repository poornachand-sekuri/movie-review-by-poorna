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

async function settleWithin(job: Promise<void>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<boolean>([
      job.then(() => true, () => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function removeLegacyArtworkRequests(page: HTMLElement): void {
  /*
   * Old AVIF image nodes are not painted anymore. Remove them as soon as the
   * Lounge runtime initializes so lazy legacy files cannot become additional
   * network work while the verified WebPs are being requested.
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
    // 35vh is enough to make the next section feel instant without asking the
    // browser to download several multi-megabyte frames at page start.
    rootMargin: '35vh 0px 35vh',
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
     * Only the structural first-screen artwork participates in the gate. The
     * featured poster is promoted to high priority but does not hold the page
     * hostage, and fonts are deliberately not a readiness dependency. A slow or
     * broken CDN response can therefore never leave the user staring at the
     * loading page indefinitely.
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
      // Warm it aggressively, but never make it a blocker.
      void waitForImage(featuredPoster).catch(() => undefined);
    }

    const jobs = artwork.map((image) => settleWithin(waitForImage(image), 1800));
    let loaded = 0;

    const reportProgress = () => {
      if (current !== generation) return;
      document.dispatchEvent(new CustomEvent('lounge:loading-progress', { detail: { loaded, total: jobs.length } }));
    };

    reportProgress();

    if (jobs.length === 0) {
      if (current === generation) document.dispatchEvent(new Event('lounge:assets-ready'));
      return;
    }

    const results = await Promise.all(jobs.map(async (job) => {
      const ok = await job;
      loaded += 1;
      reportProgress();
      return ok;
    }));

    if (current !== generation) return;

    if (results.some((ok) => !ok)) {
      document.dispatchEvent(new Event('lounge:loading-error'));
    }

    // Fail open even when one critical image times out. The CSS background,
    // panel frame or poster can finish progressively after the page is usable.
    document.dispatchEvent(new Event('lounge:assets-ready'));
  };

  const start = () => { void prepare().catch(() => {
    document.dispatchEvent(new Event('lounge:loading-error'));
    document.dispatchEvent(new Event('lounge:assets-ready'));
  }); };
  document.addEventListener('lounge:resume-loading', start);
  start();
}

/** Review and café pages use native links/forms and wait only for first-paint essentials. */
export function prepareCinemaPage(page: HTMLElement): void {
  let generation = 0;

  const prepare = async () => {
    if (document.documentElement.dataset.loungeState !== 'loading') return;
    const current = ++generation;
    page.setAttribute('aria-busy', 'true');

    const urls = new Set<string>();
    backgroundImageUrls(getComputedStyle(page).backgroundImage).forEach((url) => urls.add(url));

    const images = [...page.querySelectorAll<HTMLImageElement>('img')];
    images.forEach((image, index) => {
      image.loading = index === 0 ? 'eager' : 'lazy';
      if (index === 0) image.fetchPriority = 'high';
    });

    const artwork = [...urls].map((url) => {
      const image = new Image();
      image.decoding = 'async';
      image.fetchPriority = 'high';
      image.src = url;
      return image;
    });

    // Only the first visible content image may briefly gate the screen. Article
    // images and fonts continue progressively and never block navigation.
    const critical = [...artwork, ...images.slice(0, 1)];
    const jobs = critical.map((image) => settleWithin(waitForImage(image), 1500));
    let loaded = 0;

    const progress = () => {
      if (current === generation) {
        document.dispatchEvent(new CustomEvent('lounge:loading-progress', { detail: { loaded, total: jobs.length } }));
      }
    };

    progress();

    if (jobs.length === 0) {
      if (current === generation) document.dispatchEvent(new Event('lounge:assets-ready'));
      return;
    }

    const results = await Promise.all(jobs.map(async (job) => {
      const ok = await job;
      loaded += 1;
      progress();
      return ok;
    }));

    if (current !== generation) return;
    if (results.some((ok) => !ok)) document.dispatchEvent(new Event('lounge:loading-error'));
    document.dispatchEvent(new Event('lounge:assets-ready'));
  };

  const start = () => { void prepare().catch(() => {
    document.dispatchEvent(new Event('lounge:loading-error'));
    document.dispatchEvent(new Event('lounge:assets-ready'));
  }); };
  document.addEventListener('lounge:resume-loading', start);
  start();
}
