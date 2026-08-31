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

function fitReviewTitles() {
  document.querySelectorAll('.review-title').forEach(title => {
    const text = (title.textContent || '').trim();
    const length = Array.from(text).length;
    title.classList.remove('title-long', 'title-xlong');
    if (length > 46) title.classList.add('title-xlong');
    else if (length > 28) title.classList.add('title-long');
    title.title = text;
  });
}

function cleanCardChrome() {
  document.querySelectorAll('.review-likes').forEach(likes => {
    const count = Number(likes.querySelector('span')?.textContent || 0);
    likes.hidden = count <= 0;
  });
  fitReviewTitles();
}

function runQcPass() {
  syncFilterAppearance();
  cleanCardChrome();
}

runQcPass();

const resultsLayer = document.querySelector('#resultsLayer');
if (resultsLayer) {
  new MutationObserver(cleanCardChrome).observe(resultsLayer, {
    childList: true,
    subtree: true
  });
}

document.addEventListener('change', event => {
  if (event.target.matches('#languageFilter, #yearFilter, #ratingFilter, #sortFilter')) {
    syncFilterAppearance();
  }
});

document.querySelector('#allReviews')?.addEventListener('click', () => {
  requestAnimationFrame(runQcPass);
});
