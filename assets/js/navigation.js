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

  function hideElement(element) {
    if (!element) return;
    element.hidden = true;
    element.tabIndex = -1;
    element.setAttribute('aria-hidden', 'true');
  }

  function makeSharedNav(host, before = null) {
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
    if (before) host.insertBefore(nav, before);
    else host.append(nav);
    return true;
  }

  function configureContent() {
    if (isHome || isCineCafe) return;
    const header = document.querySelector('#brandHeader');
    makeSharedNav(header);
    hideElement(document.querySelector('#menuButton'));
    hideElement(document.querySelector('#searchButton'));
  }

  function configureCineCafe() {
    if (!isCineCafe) return;
    const page = document.querySelector('.cine-cafe-page');
    const stage = document.querySelector('#cineCafeStage');
    makeSharedNav(page, stage);
    hideElement(stage?.querySelector('.hotspot-menu'));
  }

  function configureHomeStage() {
    const stage = document.querySelector('.hm3-stage');
    if (!stage) return false;

    hideElement(stage.querySelector('.hm3-menu'));

    if (!stage.querySelector(':scope > .hm3-home')) {
      const home = document.createElement('a');
      home.className = 'hm3-hotspot hm3-home';
      home.href = HOME_PATH;
      home.setAttribute('aria-label', `${SITE_NAME} — Home`);
      stage.append(home);
    }
    return true;
  }

  configureContent();
  configureCineCafe();

  if (isHome && !configureHomeStage()) {
    const observer = new MutationObserver(() => {
      if (configureHomeStage()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* Home retains its native search icon, but its action goes to Cine Cafe.
     View All continues to route to Cine Cafe as previously approved. */
  document.addEventListener('click', event => {
    const target = event.target.closest?.(
      '.hm3-search, .hm3-recent-view-all, .hm3-prev-view-all, [data-cine-cafe-nav]'
    );
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(CINE_CAFE_PATH);
  }, true);
})();
