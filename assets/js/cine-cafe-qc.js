const controls = [
  ['#languageFilter', false],
  ['#yearFilter', false],
  ['#ratingFilter', false],
  ['#sortFilter', true]
];

function syncFilterAppearance() {
  for (const [selector, alwaysActive] of controls) {
    const select = document.querySelector(selector);
    const shell = select?.closest('.filter-control');
    if (!select || !shell) continue;
    shell.classList.toggle('has-value', alwaysActive || Boolean(select.value));
  }
}

syncFilterAppearance();

document.addEventListener('change', event => {
  if (event.target.matches('#languageFilter, #yearFilter, #ratingFilter, #sortFilter')) {
    syncFilterAppearance();
  }
});

document.querySelector('#allReviews')?.addEventListener('click', () => {
  requestAnimationFrame(syncFilterAppearance);
});
