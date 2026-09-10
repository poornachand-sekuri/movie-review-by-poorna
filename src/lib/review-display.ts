import { initPosterBackgrounds, refreshPosterBackgrounds } from './poster-background';

const marqueeTargetSelector = [
  '.now-title',
  '.cini-cafe-review-title',
  '.auditorium-related-title',
].join(', ');

const marqueeSelector = '[data-global-title-marquee]';
const marqueeAnimations = new Map<HTMLElement, Animation>();
let initialized = false;
let refreshFrame = 0;

function prepareMarquee(element: HTMLElement): void {
  element.dataset.globalTitleMarquee = 'true';

  let track = element.querySelector<HTMLElement>(':scope > [data-review-title-track]');
  if (track) return;

  const text = element.textContent?.trim() ?? '';
  if (!text) return;

  element.textContent = '';
  track = document.createElement('span');
  track.dataset.reviewTitleTrack = 'true';
  track.textContent = text;
  element.appendChild(track);
}

function fitMarquee(element: HTMLElement, reduceMotion: boolean): void {
  const track = element.querySelector<HTMLElement>(':scope > [data-review-title-track]');
  if (!track) return;

  marqueeAnimations.get(element)?.cancel();
  marqueeAnimations.delete(element);
  track.style.transform = 'translateX(0)';
  element.classList.remove('is-moving');

  // Cini Cafe previously used inline font shrinking. Rolling titles now own
  // overflow behavior, so remove that old runtime override when present.
  element.style.fontSize = '';

  if (reduceMotion || element.closest('[aria-hidden="true"]')) return;

  const style = getComputedStyle(element);
  const containerWidth = element.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0');
  const trackWidth = track.scrollWidth;
  if (containerWidth <= 0 || trackWidth <= 0) return;

  const overflow = trackWidth - containerWidth;
  if (overflow <= 1) return;

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
  marqueeAnimations.set(element, animation);
}

function refreshReviewDisplay(): void {
  refreshPosterBackgrounds();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll<HTMLElement>(marqueeTargetSelector).forEach(prepareMarquee);
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
      attributeFilter: ['src', 'srcset', 'sizes'],
    });
  }
}
