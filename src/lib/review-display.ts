import { initPosterBackgrounds, refreshPosterBackgrounds } from './poster-background';
import { createTitleMarqueeController } from './title-marquee';

const marqueeTargetSelector = [
  '.now-title',
  '.cini-cafe-review-title',
  '.auditorium-related-title',
].join(', ');

const marqueeSelector = '[data-title-marquee], [data-global-title-marquee]';
const titleSelector = `${marqueeTargetSelector}, ${marqueeSelector}`;
const marquees = createTitleMarqueeController();
const titles = new Set<HTMLElement>();
let resizeObserver: ResizeObserver | undefined;
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

function refreshReviewDisplay(): void {
  refreshFrame = 0;
  refreshPosterBackgrounds();
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll<HTMLElement>(marqueeTargetSelector).forEach(prepareMarquee);
  const currentTitles = new Set(document.querySelectorAll<HTMLElement>(marqueeSelector));
  for (const title of titles) {
    if (currentTitles.has(title)) continue;
    marquees.remove(title);
    resizeObserver?.unobserve(title);
    titles.delete(title);
  }
  for (const title of currentTitles) {
    if (!titles.has(title)) {
      titles.add(title);
      resizeObserver?.observe(title);
    }
    marquees.fit(title, reduceMotion);
  }
}

function scheduleRefresh(): void {
  if (!refreshFrame) refreshFrame = requestAnimationFrame(refreshReviewDisplay);
}

function containsTitle(node: Node): boolean {
  return node instanceof Element && (node.matches(titleSelector) || Boolean(node.querySelector(titleSelector)));
}

function affectsReviewDisplay(record: MutationRecord): boolean {
  if (record.type === 'attributes') {
    return record.attributeName === 'aria-hidden'
      ? containsTitle(record.target)
      : record.target instanceof HTMLImageElement;
  }
  const target = record.target instanceof Element ? record.target : record.target.parentElement;
  if (target?.closest(titleSelector)) return true;
  return [...record.addedNodes, ...record.removedNodes].some((node) =>
    containsTitle(node) || (node instanceof Element && (node.matches('img') || Boolean(node.querySelector('img')))),
  );
}

export function initReviewDisplay(): void {
  if (initialized) {
    scheduleRefresh();
    return;
  }
  initialized = true;
  initPosterBackgrounds();
  if (typeof ResizeObserver !== 'undefined') resizeObserver = new ResizeObserver(scheduleRefresh);

  refreshReviewDisplay();
  document.fonts?.ready?.then(scheduleRefresh).catch(() => {});
  window.addEventListener('resize', scheduleRefresh, { passive: true });

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', scheduleRefresh);

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((records) => {
      if (records.some(affectsReviewDisplay)) scheduleRefresh();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'sizes', 'aria-hidden'],
    });
  }
}
