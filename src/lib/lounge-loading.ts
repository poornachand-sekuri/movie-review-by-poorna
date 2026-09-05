/** Extract browser-selected artwork URLs, including multiple backgrounds. */
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
      const failed = () => { cleanup(); reject(new Error('Cinema image failed to load.')); };
      image.addEventListener('load', loaded, { once: true });
      image.addEventListener('error', failed, { once: true });
      if (image.complete) image.naturalWidth > 0 ? loaded() : failed();
    });
  }
  if (image.naturalWidth === 0) throw new Error('Cinema image is unavailable.');
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

/**
 * Park lower carousel posters before the browser's generous native lazy-load
 * distance can pull them ahead of the already-requested structural frames.
 */
function parkProgressivePosters(page: HTMLElement): void {
  page.querySelectorAll<HTMLImageElement>(
    '.lounge-panel--recent .recent-card__poster img, .lounge-panel--previous .previous-card img',
  ).forEach((image) => {
    const source = image.getAttribute('src');
    if (!source || image.dataset.loungeDeferredSrc) return;

    image.dataset.loungeDeferredSrc = source;
    image.removeAttribute('src');
    image.fetchPriority = 'low';
    image.style.visibility = 'hidden';
  });
}

function releaseProgressivePosters(section: HTMLElement): void {
  section.querySelectorAll<HTMLImageElement>('img[data-lounge-deferred-src]').forEach((image) => {
    const source = image.dataset.loungeDeferredSrc;
    if (!source) return;

    delete image.dataset.loungeDeferredSrc;
    image.loading = 'lazy';
    image.fetchPriority = 'low';

    const reveal = () => image.style.removeProperty('visibility');
    image.addEventListener('load', reveal, { once: true });
    image.addEventListener('error', reveal, { once: true });
    image.src = source;

    if (image.complete) reveal();
  });
}

function isNearViewport(section: HTMLElement, marginScreens = 1.5): boolean {
  if (typeof window === 'undefined') return true;
  const rect = section.getBoundingClientRect();
  const margin = window.innerHeight * marginScreens;
  return rect.bottom >= -margin && rect.top <= window.innerHeight + margin;
}

/** Structural frames are CSS-owned; JavaScript progressively releases posters only. */
function armProgressivePosters(page: HTMLElement): void {
  parkProgressivePosters(page);

  const posterSections = [
    ...page.querySelectorAll<HTMLElement>('.lounge-panel--recent, .lounge-panel--previous'),
  ];

  if (posterSections.length === 0) return;

  // Cover restored scroll positions and fast navigations before observer delivery.
  posterSections.forEach((section) => {
    if (isNearViewport(section)) releaseProgressivePosters(section);
  });

  if (typeof IntersectionObserver === 'undefined') {
    posterSections.forEach(releaseProgressivePosters);
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      if (element instanceof HTMLElement) releaseProgressivePosters(element);
      observer.unobserve(entry.target);
    });
  }, {
    root: null,
    rootMargin: '85vh 0px 85vh',
    threshold: 0.01,
  });

  posterSections.forEach((section) => observer.observe(section));
}

/**
 * The inline Lobby loader owns first-screen readiness so it can reveal before
 * this deferred page module executes. This runtime owns poster scheduling only.
 */
export function prepareLounge(page: HTMLElement): void {
  armProgressivePosters(page);
  if (document.documentElement.dataset.loungeState === 'loading') {
    page.setAttribute('aria-busy', 'true');
  }
}

/** Review and café pages still wait only for their first-paint essentials. */
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
