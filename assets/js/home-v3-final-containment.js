/* Home V3 runtime polish (v21).
   One final fitter owns My POV sizing and one final ticker owns long card titles.
   This avoids the competing/duplicated effects that previously made text look
   cramped or concatenated on iPhone Safari. */

const titleAnimations = new WeakMap();
let resizeTimer = 0;

function fitFullPov(pov) {
  if (!pov || !pov.textContent.trim() || pov.clientWidth <= 0 || pov.clientHeight <= 0) return;

  /* Always restart from the CSS preferred size so repeated ResizeObserver/font
     callbacks cannot progressively shrink the copy. */
  pov.style.removeProperty('font-size');
  const preferredPx = Number.parseFloat(getComputedStyle(pov).fontSize) || 10;
  const readableFloorPx = Math.min(preferredPx, 7.2);

  const fits = px => {
    pov.style.fontSize = `${px}px`;
    return pov.scrollHeight <= pov.clientHeight + 1 && pov.scrollWidth <= pov.clientWidth + 1;
  };

  if (fits(preferredPx)) return;

  /* Shrink only as much as required, and never below the readable design floor.
     The ticket has enough vertical room for ordinary POV lengths, so the result
     should normally stay very close to the preferred size. */
  if (!fits(readableFloorPx)) {
    pov.style.fontSize = `${readableFloorPx}px`;
    return;
  }

  let low = readableFloorPx;
  let high = preferredPx;
  let best = readableFloorPx;
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

function fitReadableTitle(title) {
  const track = title?.querySelector('.hm3-title-track');
  if (!track) return;

  /* The core helper may create a continuity copy. Remove it so there is never a
     second title that can visually join the first one. */
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

  const overflow = Math.max(0, textWidth - viewportWidth);
  const fullyExited = -(textWidth + 18);
  const duration = Math.max(10000, Math.min(17000, 9000 + overflow * 55));

  /* Timeline:
     0–18%  : show the beginning of the title
     18–60% : scroll to reveal the ending
     60–72% : hold the ending
     72–82% : move the title completely off the left edge
     82–100%: deliberate blank gap before the title restarts
     This creates a visible breathing space between the last and first letters. */
  const animation = copy.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: 0.18 },
      { transform: `translateX(${-overflow}px)`, offset: 0.60 },
      { transform: `translateX(${-overflow}px)`, offset: 0.72 },
      { transform: `translateX(${fullyExited}px)`, offset: 0.82 },
      { transform: `translateX(${fullyExited}px)`, offset: 1 }
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

  refit();
  setTimeout(refit, 140);
  setTimeout(refit, 650);
  document.fonts?.ready?.then(() => {
    refit();
    setTimeout(refit, 100);
  }).catch(() => {});

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refit, 110);
  }, { passive: true });

  /* Neutralise any later duplicate title created by the older core marquee
     observer and immediately restore the single-copy animation. */
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
