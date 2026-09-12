import { initPosterBackgrounds, refreshPosterBackgrounds } from './poster-background';

const marqueeTargetSelector = [
  '[data-title-marquee]',
  '.now-title',
  '.cini-cafe-review-title',
  '.auditorium-related-title',
].join(', ');

const ratingTargetSelector = [
  '.cini-cafe-review-stars[aria-label$="out of 5 stars"]',
  '.recent-card__stars[aria-label$="out of 5 stars"]',
  '.now-meta__rating dd[aria-label$="out of 5 stars"]',
  '.auditorium-clap-value--rating[aria-label$="out of 5 stars"]',
].join(', ');

const marqueeSelector = '[data-global-title-marquee], [data-title-marquee]';
const marqueeAnimations = new Map<HTMLElement, { animation: Animation; track: HTMLElement; overflow: number }>();
const observedTitles = new Set<HTMLElement>();
let titleObserver: ResizeObserver | undefined;
let initialized = false;
let refreshFrame = 0;

function prepareRatingStars(target: HTMLElement): void {
  const visual = target.querySelector<HTMLElement>(':scope > .auditorium-stars') ?? target;
  if (visual.dataset.ratingStarsReady === 'true') return;

  const stars = visual.textContent?.replace(/\s+/g, '') ?? '';
  if (!stars || !/^[★☆]+$/.test(stars)) return;

  const filledCount = [...stars].filter((star) => star === '★').length;
  const emptyCount = [...stars].filter((star) => star === '☆').length;
  if (filledCount + emptyCount !== 5) return;

  const parts: HTMLSpanElement[] = [];
  if (filledCount > 0) {
    const filled = document.createElement('span');
    filled.className = 'rating-star rating-star--filled';
    filled.setAttribute('aria-hidden', 'true');
    filled.textContent = '★'.repeat(filledCount);
    parts.push(filled);
  }
  if (emptyCount > 0) {
    const empty = document.createElement('span');
    empty.className = 'rating-star rating-star--empty';
    empty.setAttribute('aria-hidden', 'true');
    empty.textContent = '☆'.repeat(emptyCount);
    parts.push(empty);
  }

  visual.replaceChildren(...parts);
  visual.dataset.ratingStarsReady = 'true';
}

function prepareMarquee(element: HTMLElement): void {
  // Keep Lounge's existing CSS selectors and geometry while sharing its controller.
  if (!element.hasAttribute('data-title-marquee')) element.dataset.globalTitleMarquee = 'true';

  let track = element.querySelector<HTMLElement>(':scope > [data-review-title-track]');
  if (track) return;

  // Lounge cards already render their title inside a span.
  track = element.querySelector<HTMLElement>(':scope > span');
  if (track) {
    track.dataset.reviewTitleTrack = 'true';
    return;
  }

  const text = element.textContent?.trim() ?? '';
  if (!text) return;

  element.textContent = '';
  track = document.createElement('span');
  track.dataset.reviewTitleTrack = 'true';
  track.textContent = text;
  element.appendChild(track);
}

function stopMarquee(element: HTMLElement): void {
  const current = marqueeAnimations.get(element);
  current?.animation.cancel();
  marqueeAnimations.delete(element);
  if (current) current.track.style.transform = 'translateX(0)';
  element.classList.remove('is-moving');
}

function fitMarquee(element: HTMLElement, reduceMotion: boolean): void {
  const track = element.querySelector<HTMLElement>(':scope > [data-review-title-track]');
  if (!track || reduceMotion || element.closest('[aria-hidden="true"]')) {
    stopMarquee(element);
    return;
  }

  const style = getComputedStyle(element);
  const containerWidth = element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
  const trackWidth = track.scrollWidth;
  const overflow = trackWidth - containerWidth;
  if (containerWidth <= 0 || trackWidth <= 0 || overflow <= 1) {
    stopMarquee(element);
    return;
  }

  const current = marqueeAnimations.get(element);
  if (current?.track === track && current.overflow === overflow) return;
  stopMarquee(element);
  track.style.transform = 'translateX(0)';

  const travelMs = Math.max(2500, (overflow / 16) * 1000);
  const pauseMs = 1500;
  const totalMs = 2 * (travelMs + pauseMs);
  const endX = -overflow;

  element.classList.add('is-moving');
  const animation = track.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: pauseMs / totalMs },
      { transform: `translateX(${endX}px)`, offset: (pauseMs + travelMs) / totalMs },
      { transform: `translateX(${endX}px)`, offset: (2 * pauseMs + travelMs) / totalMs },
      { transform: 'translateX(0)', offset: 1 },
    ],
    { duration: totalMs, iterations: Infinity, easing: 'linear' },
  );
  marqueeAnimations.set(element, { animation, track, overflow });
}

function refreshReviewDisplay(): void {
  refreshPosterBackgrounds();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll<HTMLElement>(ratingTargetSelector).forEach(prepareRatingStars);

  for (const title of observedTitles) {
    if (!title.isConnected) {
      stopMarquee(title);
      titleObserver?.unobserve(title);
      observedTitles.delete(title);
    }
  }
  document.querySelectorAll<HTMLElement>(marqueeTargetSelector).forEach((title) => {
    prepareMarquee(title);
    if (!observedTitles.has(title)) {
      observedTitles.add(title);
      titleObserver?.observe(title);
    }
  });
  document.querySelectorAll<HTMLElement>(marqueeSelector).forEach((title) => fitMarquee(title, reduceMotion));
}

function scheduleRefresh(): void {
  cancelAnimationFrame(refreshFrame);
  refreshFrame = requestAnimationFrame(refreshReviewDisplay);
}

export function initReviewDisplay(): void {
  if (initialized) {
    scheduleRefresh();
    return;
  }
  initialized = true;
  initPosterBackgrounds();
  if (typeof ResizeObserver !== 'undefined') titleObserver = new ResizeObserver(scheduleRefresh);

  refreshReviewDisplay();
  document.fonts?.ready?.then(scheduleRefresh).catch(() => {});
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', scheduleRefresh);

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === 'childList' || record.type === 'attributes')) scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'sizes', 'aria-hidden'],
    });
  }
}
