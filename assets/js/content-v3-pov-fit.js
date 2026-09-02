const POV_SELECTOR = '.content-v3 .cv3-pov';
const mounted = new WeakSet();

function fitPov(pov) {
  if (!pov?.isConnected) return;

  const width = pov.clientWidth;
  const height = pov.clientHeight;
  if (!width || !height) return;

  pov.style.display = 'block';
  pov.style.webkitLineClamp = 'unset';
  pov.style.webkitBoxOrient = 'initial';
  pov.style.overflow = 'hidden';

  const mobile = window.matchMedia('(max-width: 699px)').matches;
  const maxSize = Math.min(mobile ? 14.5 : 15.5, Math.max(mobile ? 11 : 9, width * (mobile ? 0.038 : 0.04)));
  const minSize = Math.min(maxSize, Math.max(mobile ? 9.5 : 5.25, width * (mobile ? 0.024 : 0.015)));
  const heightReserve = mobile ? 2 : 3;
  const widthReserve = 2;

  const fits = () => (
    pov.scrollHeight <= Math.max(0, pov.clientHeight - heightReserve) &&
    pov.scrollWidth <= Math.max(0, pov.clientWidth - widthReserve)
  );

  pov.style.fontSize = `${maxSize}px`;
  if (fits()) {
    pov.dataset.povFit = 'max';
    return;
  }

  let low = minSize;
  let high = maxSize;
  let best = minSize;

  for (let i = 0; i < 14; i += 1) {
    const mid = (low + high) / 2;
    pov.style.fontSize = `${mid}px`;
    if (fits()) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  pov.style.fontSize = `${Math.max(minSize, best - (mobile ? 0.04 : 0.08)).toFixed(2)}px`;
  pov.dataset.povFit = best <= minSize + 0.15 ? 'minimum' : 'fitted';
}

function mountPov(pov) {
  if (mounted.has(pov)) return;
  mounted.add(pov);

  let frame = 0;
  const scheduleFit = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fitPov(pov));
  };

  scheduleFit();

  const clapboard = pov.closest('.cv3-clapboard') || pov;
  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(clapboard);
    resizeObserver.observe(pov);
  } else {
    window.addEventListener('resize', scheduleFit, { passive: true });
  }

  window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
  window.addEventListener('orientationchange', scheduleFit, { passive: true });
  document.fonts?.ready?.then(scheduleFit).catch(() => {});
}

function mountAll() {
  document.querySelectorAll(POV_SELECTOR).forEach(mountPov);
}

const domObserver = new MutationObserver(mountAll);
domObserver.observe(document.documentElement, { childList: true, subtree: true });
mountAll();
