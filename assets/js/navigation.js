(() => {
  const CINE_CAFE_PATH = '/cine-cafe/';
  const url = new URL(window.location.href);
  const isHome = !url.searchParams.has('review') && url.pathname.split('/').filter(Boolean).length === 0;
  const isCineCafe = url.pathname.replace(/\/+$/, '') === '/cine-cafe';

  function createHomeHotspot(parent, className, label) {
    if (!parent || parent.querySelector(`.${className.split(' ').join('.')}`)) return;
    const link = document.createElement('a');
    link.className = className;
    link.href = '/';
    link.setAttribute('aria-label', label);
    parent.append(link);
  }

  function configureContentHeader() {
    const header = document.querySelector('#brandHeader');
    if (!header) return;

    createHomeHotspot(
      header,
      'header-hotspot header-home',
      'Movie Reviews By Poorna — Home'
    );

    const menu = document.querySelector('#menuButton');
    if (menu) {
      menu.hidden = true;
      menu.tabIndex = -1;
      menu.setAttribute('aria-hidden', 'true');
    }
  }

  function configureCineCafeHeader() {
    const stage = document.querySelector('#cineCafeStage');
    if (!stage) return;

    createHomeHotspot(
      stage,
      'hotspot hotspot-home',
      'Movie Reviews By Poorna — Home'
    );

    const menu = stage.querySelector('.hotspot-menu');
    if (menu) {
      menu.hidden = true;
      menu.tabIndex = -1;
      menu.setAttribute('aria-hidden', 'true');
    }
  }

  function configureHomeHeader() {
    const stage = document.querySelector('.hm3-stage');
    if (!stage) return false;

    createHomeHotspot(
      stage,
      'hm3-hotspot hm3-home',
      'Movie Reviews By Poorna — Home'
    );

    const menu = stage.querySelector('.hm3-menu');
    if (menu) {
      menu.hidden = true;
      menu.tabIndex = -1;
      menu.setAttribute('aria-hidden', 'true');
    }
    return true;
  }

  configureContentHeader();
  configureCineCafeHeader();

  if (isHome && !configureHomeHeader()) {
    const observer = new MutationObserver(() => {
      if (configureHomeHeader()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('click', event => {
    if (isCineCafe) return;

    const target = event.target.closest?.(
      '#searchButton, .hm3-search, .hm3-recent-view-all, .hm3-prev-view-all, [data-cine-cafe-nav]'
    );
    if (!target) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(CINE_CAFE_PATH);
  }, true);
})();
