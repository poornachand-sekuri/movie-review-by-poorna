/* Screenshot-calibrated Home V3 runtime polish.
   Keeps the full My POV visible and runs long card titles as one intact ticker. */

const titleAnimations = new WeakMap();

function fitFullPov(pov) {
  if (!pov || !pov.textContent.trim() || pov.clientWidth <= 0 || pov.clientHeight <= 0) return;

  /* Remove the earlier Home fitter's inline value first so every recalculation
     starts from the CSS design size instead of progressively shrinking. */
  pov.style.removeProperty('font-size');
  const cssMax = Number.parseFloat(getComputedStyle(pov).fontSize) || 9.8;
  const minPx = 5.25;

  const fits = px => {
    pov.style.fontSize = `${px}px`;
    return pov.scrollHeight <= pov.clientHeight + 1 && pov.scrollWidth <= pov.clientWidth + 1;
  };

  if (fits(cssMax)) return;

  let low = minPx;
  let high = cssMax;
  let best = minPx;
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  pov.style.fontSize = `${best}px`;
}

function stopTitleAnimation(copy) {
  const active = titleAnimations.get(copy);
  if (active) active.cancel();
  titleAnimations.delete(copy);
  copy.getAnimations?.().forEach(animation => animation.cancel());
  copy.style.removeProperty('transform');
}

function fitSingleTitleTicker(title) {
  const track = title?.querySelector('.hm3-title-track');
  if (!track) return;

  /* Core Home V3 may have produced a continuity copy. One visual copy is more
     reliable in narrow cinema tickets and avoids the broken text seen on iOS. */
  while (track.children.length > 1) track.lastElementChild.remove();
  const copy = track.firstElementChild;
  if (!copy) return;

  stopTitleAnimation(copy);
  title.classList.remove('is-marquee');

  const viewportWidth = title.clientWidth;
  const textWidth = copy.scrollWidth;
  if (viewportWidth <= 0 || textWidth <= viewportWidth + 1) return;

  title.classList.add('is-marquee');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Pixel endpoints make the complete title enter from the right, traverse the
     ticket once, and leave fully on the left before repeating. */
  const startX = viewportWidth + 4;
  const endX = -(textWidth + 4);
  const distance = startX - endX;
  const duration = Math.max(7000, Math.min(15000, (distance / 24) * 1000));
  const animation = copy.animate(
    [
      { transform: `translateX(${startX}px)` },
      { transform: `translateX(${endX}px)` }
    ],
    { duration, iterations: Infinity, easing: 'linear' }
  );
  titleAnimations.set(copy, animation);
}

function installFinalContainmentRuntime() {
  const page = document.querySelector('.hm3-page');
  const pov = page?.querySelector('.hm3-pov');
  const titles = page ? [...page.querySelectorAll('.hm3-recent-title, .hm3-prev-title')] : [];
  if (!page || !pov || !titles.length) return false;

  const refit = () => requestAnimationFrame(() => {
    fitFullPov(pov);
    titles.forEach(fitSingleTitleTicker);
  });

  refit();
  document.fonts?.ready?.then(refit).catch(() => {});

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(refit);
    resizeObserver.observe(pov);
    titles.forEach(title => resizeObserver.observe(title));
  } else {
    window.addEventListener('resize', refit, { passive: true });
  }

  /* If the original marquee helper recreates a duplicate after a responsive
     change, clean it immediately and restore the measured single-copy ticker. */
  const mutationObserver = new MutationObserver(mutations => {
    if (!mutations.some(mutation => mutation.type === 'childList')) return;
    refit();
  });
  titles.forEach(title => mutationObserver.observe(title, { childList: true, subtree: true }));

  return true;
}

if (!installFinalContainmentRuntime()) {
  const observer = new MutationObserver(() => {
    if (!installFinalContainmentRuntime()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
