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

function fitOneTitle(title) {
  const text = (title.textContent || '').trim();
  if (!text || !title.clientWidth) return;

  title.title = text;
  title.classList.remove('title-long', 'title-xlong');
  title.style.fontSize = '';
  title.style.webkitLineClamp = '3';
  title.style.maxHeight = '';

  const computed = getComputedStyle(title);
  const startSize = Number.parseFloat(computed.fontSize) || 16;
  const lineHeightRatio = 1.04;

  const measure = title.cloneNode(true);
  Object.assign(measure.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-9999px',
    top: '0',
    width: `${title.clientWidth}px`,
    height: 'auto',
    maxHeight: 'none',
    overflow: 'visible',
    display: 'block',
    webkitLineClamp: 'unset',
    webkitBoxOrient: 'unset',
    fontSize: `${startSize}px`,
    lineHeight: String(lineHeightRatio),
    whiteSpace: 'normal'
  });
  document.body.append(measure);

  let size = startSize;
  const minSize = 10;
  while (size > minSize) {
    measure.style.fontSize = `${size}px`;
    const threeLines = size * lineHeightRatio * 3 + 2;
    if (measure.scrollHeight <= threeLines) break;
    size -= 0.5;
  }
  measure.remove();

  title.style.fontSize = `${size}px`;
  title.style.lineHeight = String(lineHeightRatio);
  title.style.webkitLineClamp = '3';
  title.style.maxHeight = `${size * lineHeightRatio * 3.05}px`;
}

function fitReviewTitles() {
  document.querySelectorAll('.review-title').forEach(fitOneTitle);
}

function cleanCardChrome() {
  document.querySelectorAll('.review-likes').forEach(likes => {
    const count = Number(likes.querySelector('span')?.textContent || 0);
    likes.hidden = count <= 0;
  });
  requestAnimationFrame(fitReviewTitles);
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

window.addEventListener('resize', () => requestAnimationFrame(fitReviewTitles));

document.addEventListener('change', event => {
  if (event.target.matches('#languageFilter, #yearFilter, #ratingFilter, #sortFilter')) {
    syncFilterAppearance();
  }
});

document.querySelector('#allReviews')?.addEventListener('click', () => {
  requestAnimationFrame(runQcPass);
});
