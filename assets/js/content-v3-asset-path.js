const MOBILE_ASSET_BASE = 'https://assets.moviereviewbypoorna.com/ui/pages/content/v3/mobile';

function remapContentV3Assets(root = document) {
  root.querySelectorAll('.content-v3 [style*="--asset"]').forEach(element => {
    const value = element.style.getPropertyValue('--asset');
    if (!value || value.includes('/content/v3/mobile/')) return;
    element.style.setProperty('--asset', value.replace('/ui/pages/content/v3/', '/ui/pages/content/v3/mobile/'));
  });
}

const observer = new MutationObserver(() => remapContentV3Assets());
observer.observe(document.documentElement, { childList: true, subtree: true });
remapContentV3Assets();
