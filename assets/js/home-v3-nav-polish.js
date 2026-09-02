document.addEventListener('click', event => {
  const menu = event.target.closest?.('.hm3-menu');
  if (!menu) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  location.assign('/');
}, true);

document.addEventListener('click', event => {
  const readMore = event.target.closest?.('.hm3-read-review');
  if (!readMore) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  location.assign(readMore.href);
}, true);

function installHomeNavConsistency() {
  const top = document.querySelector('.hm3-top-section');
  if (!top) return false;

  const menu = top.querySelector('.hm3-menu');
  if (menu) menu.setAttribute('aria-label', 'Go to Home');

  if (!top.querySelector('.hm3-logo-home')) {
    const logo = document.createElement('a');
    logo.className = 'hm3-logo-home';
    logo.href = '/';
    logo.setAttribute('aria-label', 'Go to Home');
    top.append(logo);
  }
  return true;
}

if (!installHomeNavConsistency()) {
  const observer = new MutationObserver(() => {
    if (!installHomeNavConsistency()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
