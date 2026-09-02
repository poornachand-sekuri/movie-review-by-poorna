const POV_SELECTOR = '.content-v3 .cv3-pov';
const mounted = new WeakSet();

function fitPov(pov) {
  if (!pov?.isConnected) return;

  const width = pov.clientWidth;
  const height = pov.clientHeight;
  if (!width || !height) return;

  // The approved artwork provides a fixed POV safe zone. Remove line-clamping and
  // fit the complete runtime text into that exact zone for the current rendered size.
  pov.style.display = 'block';
  pov.style.webkitLineClamp = 'unset';
  pov.style.webkitBoxOrient = 'initial';
  pov.style.overflow = 'hidden';

  const maxSize = Math.min(15.5, Math.max(9, width * 0.04));
  const minSize = Math.min(maxSize, Math.max(5.25, width * 0.015));

  const fits = () => (
    pov.scrollHeight <= pov.clientHeight + 1 &&
    pov.scrollWidth <= pov.clientWidth + 1
  );

  pov.style.fontSize = `${maxSize}px`;
  if (fits()) {
    pov.dataset.povFit = 'max';
    return;
  }

  let low = minSize;
  let high = maxSize;
  let best = minSize;

  for (let i = 0; i < 12; i += 1) {
    const mid = (low + high) / 2;
    pov.style.fontSize = `${mid}px`;
    if (fits()) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }

  pov.style.fontSize = `${best.toFixed(2)}px`;
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
  } else {
    window.addEventListener('resize', scheduleFit, { passive: true });
  }

  window.visualViewport?.addEventListener('resize', scheduleFit, { passive: true });
  document.fonts?.ready?.then(scheduleFit).catch(() => {});
}

function mountAll() {
  document.querySelectorAll(POV_SELECTOR).forEach(mountPov);
}

const domObserver = new MutationObserver(mountAll);
domObserver.observe(document.documentElement, { childList: true, subtree: true });
mountAll();
