import { prepareLounge } from './lounge-loading';
import { initComments } from './comments-client';
import { initPovFit } from './pov-fit';

initComments();
initPovFit();

const reviewCarousels = [...document.querySelectorAll<HTMLElement>('[data-review-carousel]')];

reviewCarousels.forEach((carousel) => {
  const track = carousel.querySelector<HTMLElement>('[data-carousel-track]');
  const pages = [...carousel.querySelectorAll<HTMLElement>('[data-carousel-page]')];
  const previousButton = carousel.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const nextButton = carousel.querySelector<HTMLButtonElement>('[data-carousel-next]');
  const status = carousel.querySelector<HTMLElement>('[data-carousel-status]');

  if (!track || pages.length === 0) return;

  let pageIndex = 0;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let suppressClick = false;
  let suppressTimer: number | undefined;

  const setPage = (requestedIndex: number) => {
    const nextIndex = Math.max(0, Math.min(pages.length - 1, requestedIndex));
    pageIndex = nextIndex;
    track.style.transform = `translate3d(${-pageIndex * 100}%, 0, 0)`;

    pages.forEach((page, index) => {
      const active = index === pageIndex;
      page.setAttribute('aria-hidden', active ? 'false' : 'true');
      if (active) page.removeAttribute('inert');
      else page.setAttribute('inert', '');
    });

    if (previousButton) previousButton.disabled = pageIndex === 0;
    if (nextButton) nextButton.disabled = pageIndex === pages.length - 1;
    if (status) status.textContent = `Page ${pageIndex + 1} of ${pages.length}`;
  };

  previousButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    setPage(pageIndex - 1);
  });

  nextButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    setPage(pageIndex + 1);
  });

  carousel.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('[data-carousel-prev], [data-carousel-next]')) return;

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
  });

  carousel.addEventListener('pointerup', (event) => {
    if (pointerId !== event.pointerId) return;

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const threshold = Math.min(72, Math.max(32, carousel.clientWidth * 0.09));
    const isHorizontalSwipe = Math.abs(deltaX) >= threshold && Math.abs(deltaX) > Math.abs(deltaY) * 1.15;

    pointerId = null;
    if (!isHorizontalSwipe) return;

    suppressClick = true;
    if (suppressTimer !== undefined) window.clearTimeout(suppressTimer);
    suppressTimer = window.setTimeout(() => {
      suppressClick = false;
      suppressTimer = undefined;
    }, 450);

    setPage(pageIndex + (deltaX < 0 ? 1 : -1));
  });

  carousel.addEventListener('pointercancel', () => {
    pointerId = null;
  });

  carousel.addEventListener(
    'click',
    (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      if (suppressTimer !== undefined) {
        window.clearTimeout(suppressTimer);
        suppressTimer = undefined;
      }
    },
    true,
  );

  setPage(0);
});

const loungePage = document.querySelector<HTMLElement>('.lounge-page');
const focusableSections = [
  ...document.querySelectorAll<HTMLElement>('.lounge-stage > .lounge-panel:not(.lounge-panel--banner)'),
];

if (loungePage && focusableSections.length > 0) {
  const focusLayer = document.createElement('div');
  focusLayer.className = 'lounge-focus-layer';
  focusLayer.setAttribute('role', 'dialog');
  focusLayer.setAttribute('aria-modal', 'true');
  focusLayer.setAttribute('aria-label', 'Enlarged Lounge section');
  focusLayer.setAttribute('aria-hidden', 'true');

  const closeButton = document.createElement('button');
  closeButton.className = 'lounge-focus-close';
  closeButton.type = 'button';
  closeButton.tabIndex = -1;
  closeButton.setAttribute('aria-label', 'Close enlarged section');
  closeButton.textContent = '✕';

  const focusStage = document.createElement('div');
  focusStage.className = 'lounge-focus-stage';

  focusLayer.appendChild(closeButton);
  focusLayer.appendChild(focusStage);
  loungePage.appendChild(focusLayer);

  let focusedSection: HTMLElement | null = null;
  let placeholder: HTMLDivElement | null = null;
  const interactiveSelector = 'a, button, input, textarea, select, label, [contenteditable="true"]';

  const openFocus = (section: HTMLElement, initialFocus: HTMLElement = closeButton) => {
    if (focusedSection) return;
    const parent = section.parentElement;
    if (!parent) return;

    const rect = section.getBoundingClientRect();
    placeholder = document.createElement('div');
    placeholder.className = 'lounge-focus-placeholder';
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.maxWidth = `${rect.width}px`;

    parent.insertBefore(placeholder, section);
    focusedSection = section;
    focusStage.appendChild(section);
    section.classList.add('is-lounge-focused');
    const isOpinion = section.classList.contains('lounge-panel--opinion');
    focusLayer.classList.toggle('is-opinion-focused', isOpinion);
    // CSS places this semantic close control on the opinion artwork's EXIT
    // tab or above the new Now Reviewed panel.
    section.appendChild(closeButton);
    closeButton.setAttribute('aria-label', isOpinion ? 'Exit enlarged Share Your Opinion' : 'Close enlarged section');
    focusLayer.classList.add('is-open');
    focusLayer.scrollTop = 0;
    focusLayer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('lounge-focus-open');
    closeButton.tabIndex = 0;

    requestAnimationFrame(() => {
      if (focusedSection === section) initialFocus.focus({ preventScroll: initialFocus === closeButton });
    });
  };

  const closeFocus = () => {
    if (!focusedSection || !placeholder) return;
    const parent = placeholder.parentElement;
    if (!parent) return;

    const section = focusedSection;
    closeButton.tabIndex = -1;
    focusLayer.insertBefore(closeButton, focusStage);
    section.classList.remove('is-lounge-focused');
    parent.replaceChild(section, placeholder);
    focusedSection = null;
    placeholder = null;
    focusLayer.classList.remove('is-open', 'is-opinion-focused');
    focusLayer.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('lounge-focus-open');

    requestAnimationFrame(() => {
      section.focus({ preventScroll: true });
    });
  };

  focusableSections.forEach((section) => {
    section.tabIndex = 0;
    section.setAttribute('aria-haspopup', 'dialog');

    section.addEventListener('click', (event) => {
      if (focusedSection === section) return;
      const target = event.target;
      if (target instanceof Element && target.closest(interactiveSelector)) return;
      openFocus(section);
    });

    section.addEventListener('keydown', (event) => {
      if (event.target !== section) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openFocus(section);
    });

    if (section.classList.contains('lounge-panel--opinion')) {
      // Typing opens the readable ticket while retaining the selected field
      // and its value. The Lounge's locked outer width stays unchanged.
      section.addEventListener('focusin', (event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          openFocus(section, target);
        }
      });
    }
  });

  closeButton.addEventListener('click', closeFocus);
  focusLayer.addEventListener('click', (event) => {
    if (event.target === focusLayer || event.target === focusStage) closeFocus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focusedSection) closeFocus();
  });
}

if (loungePage) prepareLounge(loungePage);
