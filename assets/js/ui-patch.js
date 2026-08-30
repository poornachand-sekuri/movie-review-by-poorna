const searchDialog = document.querySelector('#searchDialog');
const searchClose = document.querySelector('#searchClose');

if (searchDialog && searchClose) {
  searchClose.addEventListener('click', () => {
    if (typeof searchDialog.close === 'function') searchDialog.close();
    else searchDialog.removeAttribute('open');
  });
}

function formatCastCrewLines(root = document) {
  const cast = root.querySelector?.('.movie-cast');
  if (!cast) return;
  const value = cast.textContent || '';
  if (!value.includes(' • ')) return;
  cast.textContent = value.split(' • ').join('\n');
}

const contentRoot = document.querySelector('#content');
if (contentRoot) {
  formatCastCrewLines(contentRoot);
  const observer = new MutationObserver(() => formatCastCrewLines(contentRoot));
  observer.observe(contentRoot, { childList: true, subtree: true });
}
