const searchDialog = document.querySelector('#searchDialog');
const searchClose = document.querySelector('#searchClose');

if (searchDialog && searchClose) {
  searchClose.addEventListener('click', () => {
    if (typeof searchDialog.close === 'function') searchDialog.close();
    else searchDialog.removeAttribute('open');
  });
}
