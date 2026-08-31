(() => {
  const HOME_PATH = '/';
  const CINE_CAFE_PATH = '/cine-cafe/';
  const SITE_NAME = 'Movie Reviews By Poorna';
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

  function homeIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 10.8 12 3.8l8.5 7v9.4h-6v-5.7h-5v5.7h-6z"></path>
      </svg>`;
  }

  function searchIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="10.8" cy="10.8" r="6.2"></circle>
        <path d="m15.4 15.4 5 5"></path>
      </svg>`;
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

  function makeSharedNav(host) {
    if (!host || host.querySelector(':scope > .shared-top-nav')) return false;

    const nav = document.createElement('nav');
    nav.className = 'shared-top-nav';
    nav.setAttribute('aria-label', 'Primary navigation');

    const home = document.createElement('a');
    home.className = 'shared-nav-action shared-nav-home';
    home.href = HOME_PATH;
    home.setAttribute('aria-label', 'Home');
    home.innerHTML = `${homeIcon()}<span>Home</span>`;

    const brand = document.createElement('a');
    brand.className = 'shared-nav-brand';
    brand.href = HOME_PATH;
    brand.setAttribute('aria-label', `${SITE_NAME} — Home`);
    brand.innerHTML = `<span class="shared-nav-brand-main">${SITE_NAME}</span>`;

    const search = document.createElement('button');
    search.className = 'shared-nav-action shared-nav-search';
    search.type = 'button';
    search.setAttribute('aria-label', isCineCafe ? 'Focus Cine Cafe search' : 'Open Cine Cafe search');
    search.innerHTML = `${searchIcon()}<span>Search</span>`;
    search.addEventListener('click', () => {
      if (isCineCafe) {
        document.querySelector('#cineSearch')?.focus();
        return;
      }
      window.location.assign(CINE_CAFE_PATH);
    });

    nav.append(home, brand, search);
    host.append(nav);
    disableLegacyHeaderControls(host);
    return true;
  }

  function configureStaticHosts() {
    makeSharedNav(document.querySelector('#brandHeader'));
    makeSharedNav(document.querySelector('#cineCafeStage'));
    disableLegacyHeaderControls();
  }

  configureStaticHosts();

  if (isHome && !makeSharedNav(document.querySelector('.hm3-stage'))) {
    const observer = new MutationObserver(() => {
      const stage = document.querySelector('.hm3-stage');
      if (!stage) return;
      makeSharedNav(stage);
      disableLegacyHeaderControls(stage);
      observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
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
