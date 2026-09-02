/* Home V3 stable text runtime (v22).
   The core Home builder still installs its original ResizeObservers. To avoid
   those older observers fighting the final layout, this runtime replaces the
   live POV/title nodes once after render; the legacy observers remain attached
   only to detached nodes. From that point there is one POV fitter and one title
   animator controlling the visible UI. */

const titleAnimations = new WeakMap();
let resizeTimer = 0;

function stopTitleAnimation(copy) {
  const active = titleAnimations.get(copy);
  if (active) active.cancel();
  titleAnimations.delete(copy);
  copy.getAnimations?.().forEach(animation => animation.cancel());
  copy.style.removeProperty('transform');
}

function replaceLegacyBoundNodes(page) {
  const oldPov = page.querySelector('.hm3-pov');
  const oldTitles = [...page.querySelectorAll('.hm3-recent-title, .hm3-prev-title')];
  if (!oldPov || !oldTitles.length) return null;

  const pov = oldPov.cloneNode(true);
  oldPov.replaceWith(pov);

  const titles = oldTitles.map(oldTitle => {
    const title = oldTitle.cloneNode(true);
    const track = title.querySelector('.hm3-title-track');
    if (track) {
      while (track.children.length > 1) track.lastElementChild.remove();
    }
    oldTitle.replaceWith(title);
    return title;
  });

  return { pov, titles };
}

function applyPovMetrics(pov, fontPx, lineRatio) {
  pov.style.fontSize = `${fontPx}px`;
  pov.style.lineHeight = `${(fontPx * lineRatio).toFixed(3)}px`;
}

function povFits(pov) {
  return pov.scrollHeight <= pov.clientHeight + 1 && pov.scrollWidth <= pov.clientWidth + 1;
}

function findLargestFittingFont(pov, low, high, lineRatio) {
  let best = low;
  for (let i = 0; i < 18; i += 1) {
    const mid = (low + high) / 2;
    applyPovMetrics(pov, mid, lineRatio);
    if (povFits(pov)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  applyPovMetrics(pov, best, lineRatio);
  return best;
}

function fitFullPov(pov) {
  if (!pov || !pov.textContent.trim() || pov.clientWidth <= 0 || pov.clientHeight <= 0) return;

  pov.style.removeProperty('font-size');
  pov.style.removeProperty('line-height');

  const computed = getComputedStyle(pov);
  const preferredPx = Number.parseFloat(computed.fontSize) || 7;
  const preferredLinePx = Number.parseFloat(computed.lineHeight) || preferredPx * 1.2;
  const preferredRatio = Math.max(1.08, Math.min(1.28, preferredLinePx / preferredPx));
  const softFloorPx = Math.min(preferredPx, 6.35);
  const hardFloorPx = Math.min(softFloorPx, 5.7);
  const minimumLineRatio = 1.08;

  applyPovMetrics(pov, preferredPx, preferredRatio);
  if (povFits(pov)) return;

  /* First protect the intended typography: keep the normal line-height and only
     reduce font size as much as necessary down to the readable soft floor. */
  applyPovMetrics(pov, softFloorPx, preferredRatio);
  if (povFits(pov)) {
    findLargestFittingFont(pov, softFloorPx, preferredPx, preferredRatio);
    return;
  }

  /* If a long POV still needs space, tighten line-height before making the font
     materially smaller. This keeps the copy feeling full-sized rather than
     compressed into a tiny block. */
  let selectedRatio = preferredRatio;
  for (let ratio = preferredRatio - 0.02; ratio >= minimumLineRatio - 0.001; ratio -= 0.02) {
    const safeRatio = Math.max(minimumLineRatio, ratio);
    applyPovMetrics(pov, softFloorPx, safeRatio);
    selectedRatio = safeRatio;
    if (povFits(pov)) {
      findLargestFittingFont(pov, softFloorPx, preferredPx, safeRatio);
      return;
    }
  }

  /* Emergency range only: current production POVs should normally never reach
     this branch, but if a future review is unusually long we prefer complete
     visible copy over clipping the last lines. */
  applyPovMetrics(pov, hardFloorPx, selectedRatio);
  if (povFits(pov)) {
    findLargestFittingFont(pov, hardFloorPx, softFloorPx, selectedRatio);
    return;
  }

  applyPovMetrics(pov, hardFloorPx, minimumLineRatio);
}

function fitSlowTitle(title) {
  const track = title?.querySelector('.hm3-title-track');
  if (!track) return;

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
  const fullyExited = -(textWidth + 22);
  const duration = Math.max(30000, Math.min(45000, 30000 + overflow * 120));

  /* Deliberately slow, readable cinema ticker:
     0–16%   hold the beginning of the title
     16–61%  slow right-to-left reveal
     61–70%  hold the ending
     70–76%  move completely off the left edge
     76–100% blank breathing gap before the next cycle begins
     There is one copy only, so the last word can never run directly into the
     first word of the next cycle. */
  const animation = copy.animate(
    [
      { transform: 'translateX(0)', offset: 0 },
      { transform: 'translateX(0)', offset: 0.16 },
      { transform: `translateX(${-overflow}px)`, offset: 0.61 },
      { transform: `translateX(${-overflow}px)`, offset: 0.70 },
      { transform: `translateX(${fullyExited}px)`, offset: 0.76 },
      { transform: `translateX(${fullyExited}px)`, offset: 1 }
    ],
    { duration, iterations: Infinity, easing: 'linear' }
  );

  titleAnimations.set(copy, animation);
}

function bindStableRuntime(page) {
  if (!page || page.dataset.hm3StableTextBound === 'true') return;
  page.dataset.hm3StableTextBound = 'true';

  const live = replaceLegacyBoundNodes(page);
  if (!live) {
    delete page.dataset.hm3StableTextBound;
    return;
  }

  const { pov, titles } = live;
  const refit = () => requestAnimationFrame(() => {
    fitFullPov(pov);
    titles.forEach(fitSlowTitle);
  });

  refit();
  setTimeout(refit, 120);
  setTimeout(refit, 600);
  document.fonts?.ready?.then(() => {
    refit();
    setTimeout(refit, 120);
  }).catch(() => {});

  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refit, 160);
  }, { passive: true });

  /* Observe stable section geometry rather than the text nodes themselves. That
     avoids self-triggered resize loops when the fitter changes font metrics. */
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(refit);
    const targets = [
      page.querySelector('.hm3-now-section'),
      page.querySelector('.hm3-recent-section'),
      page.querySelector('.hm3-previous-section')
    ].filter(Boolean);
    targets.forEach(target => observer.observe(target));
  }
}

function installStableRuntime() {
  const page = document.querySelector('.hm3-page');
  if (!page) return false;
  /* Wait until the Home builder finishes attaching its original observers, then
     replace the visible text nodes so those legacy observers cannot affect them. */
  setTimeout(() => bindStableRuntime(page), 0);
  return true;
}

if (!installStableRuntime()) {
  const observer = new MutationObserver(() => {
    if (!installStableRuntime()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
