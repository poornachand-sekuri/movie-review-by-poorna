const posterSelector = [
  '.now-poster img',
  '.recent-card__poster img',
  '.previous-card img',
  '.cini-cafe-poster-zone img',
  '.auditorium-movie-poster',
  '.auditorium-related-poster-frame img',
].join(', ');

function syncPosterBackground(image: HTMLImageElement): void {
  const frame = image.parentElement;
  if (!frame) return;

  // Wait for the foreground to load so decorative backgrounds cannot bypass
  // lazy loading or Lounge's deferred poster queue.
  const source = image.complete && image.naturalWidth > 0
    ? image.currentSrc || image.src
    : '';
  frame.classList.toggle('review-poster-soft', Boolean(source));
  image.classList.toggle('review-poster-foreground', Boolean(source));
  if (source) {
    // JSON quoting protects CSS strings containing quotes or backslashes.
    frame.style.setProperty('--review-poster-background', `url(${JSON.stringify(source)})`);
  } else {
    frame.style.removeProperty('--review-poster-background');
  }
}

export function refreshPosterBackgrounds(): void {
  document.querySelectorAll<HTMLImageElement>(posterSelector).forEach(syncPosterBackground);
}

export function initPosterBackgrounds(): void {
  const onImageEvent = (event: Event): void => {
    const image = event.target;
    if (image instanceof HTMLImageElement && image.matches(posterSelector)) {
      syncPosterBackground(image);
    }
  };
  // Capture handles non-bubbling image events, including future Café cards.
  document.addEventListener('load', onImageEvent, true);
  document.addEventListener('error', onImageEvent, true);
}
