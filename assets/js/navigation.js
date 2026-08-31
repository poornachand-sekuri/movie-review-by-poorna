(() => {
  const HOME_PATH = '/';
  const CINE_CAFE_PATH = '/cine-cafe/';
  const SITE_NAME = 'Movie Reviews By Poorna';
  const HEADER_ART = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v2/mobile/01-top-logo-header-LOCKED.avif';
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const isHome = !url.searchParams.has('review') && pathParts.length === 0;
  const isCineCafe = url.pathname.replace(/\/+$/, '') === '/cine-cafe';

  function normalizeMetadata() {
    if (document.title !== SITE_NAME) document.title = SITE_NAME;
    const description = document.querySelector('meta[name="description"]');
    if (description && description.getAttribute('content') !== SITE_NAME) {
      description.setAttribute('content', SITE_NAME);
    }
  }

  normalizeMetadata();
  const titleElement = document.querySelector('title');
  if (titleElement) {
    new MutationObserver(normalizeMetadata).observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function disableLegacyHeaderControls(root = document) {
    const selectors = [
      '#menuButton',
      '#searchButton',
      '.hm3-menu',
      '.hm3-search',
      '.hm3-home',
      '.hotspot-menu',
      '.hotspot-search',
      '.hotspot-bell',
      '.hotspot-home'
    ];

    for (const element of root.querySelectorAll(selectors.join(','))) {
      element.hidden = true;
      element.tabIndex = -1;
      element.setAttribute('aria-hidden', 'true');
    }
  }

  function makeSharedNav(host, { prepend = false } = {}) {
    if (!host || host.querySelector(':scope > .shared-top-nav')) return false;

    const nav = document.createElement('nav');
    nav.className = 'shared-top-nav';
    nav.setAttribute('aria-label', 'Primary navigation');

    const artwork = document.createElement('img');
    artwork.className = 'shared-nav-artwork';
    artwork.src = HEADER_ART;
    artwork.alt = SITE_NAME;
    artwork.decoding = 'async';

    const brand = document.createElement('a');
    brand.className = 'shared-nav-brand-hotspot';
    brand.href = HOME_PATH;
    brand.setAttribute('aria-label', `${SITE_NAME} — Home`);

    const search = document.createElement('button');
    search.className = 'shared-nav-search-hotspot';
    search.type = 'button';
    search.setAttribute('aria-label', isCineCafe ? 'Focus Cine Cafe search' : 'Open Cine Cafe search');
    search.addEventListener('click', () => {
      if (isCineCafe) {
        document.querySelector('#cineSearch')?.focus();
        return;
      }
      window.location.assign(CINE_CAFE_PATH);
    });

    nav.append(artwork, brand, search);
    if (prepend) host.prepend(nav);
    else host.append(nav);
    disableLegacyHeaderControls(host);
    return true;
  }

  function wrapStage(stage, className) {
    if (!stage) return false;
    if (stage.parentElement?.classList.contains(className)) return true;

    const shell = document.createElement('div');
    shell.className = className;
    stage.before(shell);
    shell.append(stage);
    return true;
  }

  // Content and Home share the same real header host. Home CSS explicitly
  // reveals this host even though the locked Home implementation used to hide it.
  makeSharedNav(document.querySelector('#brandHeader'));

  if (isCineCafe) {
    const page = document.querySelector('.cine-cafe-page');
    makeSharedNav(page, { prepend: true });
    wrapStage(document.querySelector('#cineCafeStage'), 'cine-cafe-cropped-shell');
  }

  disableLegacyHeaderControls();

  if (isHome) {
    const configureHomeStage = () => {
      const stage = document.querySelector('.hm3-stage');
      if (!stage) return false;
      wrapStage(stage, 'hm3-cropped-shell');
      disableLegacyHeaderControls(stage);
      return true;
    };

    if (!configureHomeStage()) {
      const observer = new MutationObserver(() => {
        if (configureHomeStage()) observer.disconnect();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  document.addEventListener('click', event => {
    const target = event.target.closest?.(
      '.hm3-recent-view-all, .hm3-prev-view-all, [data-cine-cafe-nav]'
    );
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(CINE_CAFE_PATH);
  }, true);
})();
