/* Home V3 runtime repair.
   Keeps My POV fully inside its AVIF ticket and makes long card titles readable
   without duplicated or concatenated marquee fragments. */

const titleAnimations = new WeakMap();
let resizeTimer = 0;

function fitFullPov(pov) {
  if (!pov || !pov.textContent.trim() || pov.clientWidth <= 0 || pov.clientHeight <= 0) return;

  /* Always restart from the CSS design size. The original Home fitter may have
     written an inline size; clearing it prevents progressive shrink on refits. */
  pov.style.removeProperty('font-size');
  const cssMax = Number.parseFloat(getComputedStyle(pov).fontSize) || 8;
  const minPx = 4.4;

  const fits = px => {
    pov.style.fontSize = `${px}px`;
    return pov.scrollHeight <= pov.clientHeight + 1 && pov.scrollWidth <= pov.clientWidth + 1;
  };

  if (fits(cssMax)) return;

  let low = minPx;
  let high = Math.max(cssMax, minPx);
  let best = minPx;
  for (let i = 0; i < 18; i += 1) {
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

function fitReadableTitle(title) {
  const track = title?.querySelector('.hm3-title-track');
  if (!track) return;

  /* The core helper can add a continuity copy. Remove it: on narrow iPhone
     cards it was producing merged fragments such as RTSLITTLE / OGT... */
  while (track.children.length > 1) track.lastElementChild.remove();
  const copy = track.firstElementChild;
  if (!copy) return;

  stopTitleAnimation(copy);
  title.classList.remove('is-marquee');
  title.style.textAlign = 'center';

  const viewportWidth = title.clientWidth;
  const textWidth = copy.scrollWidth;
  if (viewportWidth <= 0 || textWidth <= viewportWidth + 1) return;

  title.classList.add('is-marquee');
  title.style.textAlign = 'left';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  /* Show the beginning of the real title first, hold briefly, then reveal the
     rest right-to-left. At the end it pauses before resetting to the beginning.
     No second copy is ever visible, so the title cannot look concatenated. */
  const overflow = Math.max(0, textWidth - viewportWidth);
  const duration = Math.max(8500, Math.min(15000, 7000 + overflow * 45));
  const animation = copy.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: 0.16 },
      { transform: `translateX(${-overflow}px)`, offset: 0.84 },
      { transform: `translateX(${-overflow}px)`, offset: 1 }
    ],
    { duration, iterations: Infinity, easing: 'linear' }
  );
  titleAnimations.set(copy, animation);
}

function refitHome(page) {
  const pov = page?.querySelector('.hm3-pov');
  const titles = page ? [...page.querySelectorAll('.hm3-recent-title, .hm3-prev-title')] : [];
  if (!pov || !titles.length) return;
  fitFullPov(pov);
  titles.forEach(fitReadableTitle);
}

function installFinalContainmentRuntime() {
  const page = document.querySelector('.hm3-page');
  if (!page) return false;

  const refit = () => requestAnimationFrame(() => refitHome(page));

  /* Run after the core Home builder, then again after any late font/layout work
     so this final containment pass always wins over the older fitters. */
  refit();
  setTimeout(refit, 120);
  setTimeout(refit, 600);
  document.fonts?.ready?.then(() => {
    refit();
    setTimeout(refit, 80);
  }).catch(() => {});

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refit, 90);
  }, { passive: true });

  /* If the older marquee helper recreates a duplicate title after a responsive
     recalculation, clean it and restore the single-copy ticker immediately. */
  const titleObserver = new MutationObserver(mutations => {
    if (!mutations.some(mutation => mutation.type === 'childList')) return;
    refit();
  });
  page.querySelectorAll('.hm3-recent-title, .hm3-prev-title').forEach(title => {
    titleObserver.observe(title, { childList: true, subtree: true });
  });

  return true;
}

if (!installFinalContainmentRuntime()) {
  const observer = new MutationObserver(() => {
    if (!installFinalContainmentRuntime()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
