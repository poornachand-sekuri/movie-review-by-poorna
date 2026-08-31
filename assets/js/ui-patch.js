const searchDialog = document.querySelector('#searchDialog');
const searchClose = document.querySelector('#searchClose');

if (searchDialog && searchClose) {
  searchClose.addEventListener('click', () => {
    if (typeof searchDialog.close === 'function') searchDialog.close();
    else searchDialog.removeAttribute('open');
  });
}

/*
 * Surgical visual fixes only.
 * 1) Keep the full movie poster uncropped while removing the obvious empty/letterbox
 *    look that landscape source images create inside the portrait gold frame.
 * 2) Align the final single-source theater artwork as one continuous Top → Middle → Bottom
 *    composition. The old theater overlap and seat-brightness tuning belonged to the
 *    previous artwork and must not affect the new master-derived AVIFs.
 */
const visualPatch = document.createElement('style');
visualPatch.textContent = `
  .poster-safe-zone {
    inset: 4.4% 4.6% !important;
    isolation: isolate;
    background: #030303 !important;
    box-shadow: inset 0 0 16px rgba(0,0,0,.78);
  }

  .poster-safe-zone::before {
    content: "";
    position: absolute;
    inset: -12%;
    z-index: 0;
    background-image: var(--poster-backdrop, none);
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;
    filter: blur(11px) brightness(.30) saturate(.82);
    opacity: .82;
    transform: scale(1.08);
    pointer-events: none;
  }

  .movie-poster {
    position: relative;
    z-index: 1;
    display: block;
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    object-fit: contain !important;
    object-position: center center !important;
    background: transparent !important;
  }

  /* Final theater master: do not pull the middle over the fixed Top artwork. */
  .theater-top {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    margin: 0 !important;
  }

  /* Keep review copy entirely inside the black projection screen. */
  .theater-middle {
    margin-top: -1px !important;
    margin-bottom: -1px !important;
    min-height: 0 !important;
    padding: 14px 18.5% 22px !important;
    background-size: 100% 100% !important;
    background-position: center center !important;
    background-repeat: no-repeat !important;
  }

  /* Preserve the new seating artwork at its authored brightness and color. */
  .theater-bottom {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    margin-top: -1px !important;
    opacity: 1 !important;
    filter: none !important;
    transform: none !important;
  }
`;
document.head.append(visualPatch);

function syncPosterBackdrop() {
  const poster = document.querySelector('.movie-poster');
  const zone = document.querySelector('.poster-safe-zone');
  if (!poster || !zone) return false;

  const apply = () => {
    const source = poster.currentSrc || poster.src;
    if (source) zone.style.setProperty('--poster-backdrop', `url("${source}")`);
  };

  apply();
  poster.addEventListener('load', apply, { once: true });
  return true;
}

if (!syncPosterBackdrop()) {
  const observer = new MutationObserver(() => {
    if (syncPosterBackdrop()) observer.disconnect();
  });
  observer.observe(document.querySelector('#content') || document.body, {
    childList: true,
    subtree: true
  });
}
