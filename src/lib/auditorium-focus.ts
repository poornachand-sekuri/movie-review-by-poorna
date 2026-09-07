type AuditoriumFocusKind = 'clapboard' | 'theater' | 'share' | 'related' | 'opinion';

const FOCUS_LABELS: Record<AuditoriumFocusKind, string> = {
  clapboard: 'Movie Details',
  theater: 'Now Screening',
  share: 'Share This Review',
  related: 'Related Reviews',
  opinion: 'Share Your Opinion',
};

const GENERIC_EXIT_KINDS = new Set<AuditoriumFocusKind>(['clapboard', 'share', 'related']);

function markAdditionalFocusableSections(): void {
  const mappings: Array<{ selector: string; kind: AuditoriumFocusKind }> = [
    { selector: '.auditorium-section--clapboard', kind: 'clapboard' },
    { selector: '.auditorium-section--share', kind: 'share' },
    { selector: '.auditorium-section--related', kind: 'related' },
  ];

  for (const { selector, kind } of mappings) {
    const section = document.querySelector<HTMLElement>(selector);
    if (!section) continue;

    section.dataset.auditoriumFocusable = kind;
    section.tabIndex = 0;
    section.setAttribute('aria-expanded', 'false');

    const existingLabel = section.getAttribute('aria-label')?.replace(/\.\s*Activate to enlarge\.?$/i, '') ?? FOCUS_LABELS[kind];
    section.setAttribute('aria-label', `${existingLabel}. Activate to enlarge.`);
  }
}

export function initAuditoriumFocus(): void {
  const page = document.querySelector<HTMLElement>('[data-cinema-page]');
  if (!page || page.dataset.auditoriumFocusReady === 'true') return;
  page.dataset.auditoriumFocusReady = 'true';

  markAdditionalFocusableSections();

  const focusableSections = [...document.querySelectorAll<HTMLElement>('[data-auditorium-focusable]')];
  const theaterSection = document.querySelector<HTMLElement>('[data-auditorium-theater]');
  if (focusableSections.length === 0) return;

  const fontLabels = ['small', 'compact', 'medium', 'large', 'extra large'] as const;
  let theaterFontStep = 2;
  let focusedSection: HTMLElement | null = null;
  let placeholder: HTMLDivElement | null = null;

  const focusLayer = document.createElement('div');
  focusLayer.className = 'auditorium-focus-layer';
  focusLayer.setAttribute('role', 'dialog');
  focusLayer.setAttribute('aria-modal', 'true');
  focusLayer.setAttribute('aria-hidden', 'true');

  const focusStage = document.createElement('div');
  focusStage.className = 'auditorium-focus-stage';

  const genericToolbar = document.createElement('div');
  genericToolbar.className = 'auditorium-focus-toolbar';
  genericToolbar.hidden = true;

  const genericTitle = document.createElement('span');
  genericTitle.className = 'auditorium-focus-toolbar-title';

  const genericClose = document.createElement('button');
  genericClose.type = 'button';
  genericClose.className = 'auditorium-focus-toolbar-exit';
  genericClose.setAttribute('aria-label', 'Exit enlarged section');
  genericClose.innerHTML = '<span>EXIT</span><span aria-hidden="true">›</span>';
  genericClose.tabIndex = -1;

  genericToolbar.appendChild(genericTitle);
  genericToolbar.appendChild(genericClose);

  const readingToolbar = document.createElement('div');
  readingToolbar.className = 'auditorium-reading-toolbar';
  readingToolbar.setAttribute('role', 'group');
  readingToolbar.setAttribute('aria-label', 'Review text size controls');
  readingToolbar.hidden = true;

  const toolbarMessage = document.createElement('span');
  toolbarMessage.className = 'auditorium-reading-toolbar-message';
  toolbarMessage.textContent = 'Adjust text size for comfortable reading';

  const toolbarActions = document.createElement('div');
  toolbarActions.className = 'auditorium-reading-toolbar-actions';

  const fontDecrease = document.createElement('button');
  fontDecrease.type = 'button';
  fontDecrease.className = 'auditorium-font-control';
  fontDecrease.setAttribute('aria-label', 'Decrease review text size');
  fontDecrease.setAttribute('aria-controls', 'auditorium-review-body');
  fontDecrease.textContent = 'A−';
  fontDecrease.tabIndex = -1;

  const fontIncrease = document.createElement('button');
  fontIncrease.type = 'button';
  fontIncrease.className = 'auditorium-font-control';
  fontIncrease.setAttribute('aria-label', 'Increase review text size');
  fontIncrease.setAttribute('aria-controls', 'auditorium-review-body');
  fontIncrease.textContent = 'A+';
  fontIncrease.tabIndex = -1;

  const fontStatus = document.createElement('span');
  fontStatus.className = 'visually-hidden';
  fontStatus.setAttribute('aria-live', 'polite');

  toolbarActions.appendChild(fontDecrease);
  toolbarActions.appendChild(fontIncrease);
  readingToolbar.appendChild(toolbarMessage);
  readingToolbar.appendChild(toolbarActions);
  readingToolbar.appendChild(fontStatus);

  focusStage.appendChild(genericToolbar);
  focusStage.appendChild(readingToolbar);
  focusLayer.appendChild(focusStage);
  document.body.appendChild(focusLayer);

  const applyTheaterFontStep = (nextStep: number) => {
    if (!theaterSection) return;
    theaterFontStep = Math.max(0, Math.min(fontLabels.length - 1, Math.trunc(nextStep)));
    theaterSection.dataset.fontStep = String(theaterFontStep);
    fontDecrease.disabled = theaterFontStep === 0;
    fontIncrease.disabled = theaterFontStep === fontLabels.length - 1;
    fontStatus.textContent = `Review text size: ${fontLabels[theaterFontStep]}`;
  };

  applyTheaterFontStep(theaterFontStep);

  fontDecrease.addEventListener('click', (event) => {
    event.stopPropagation();
    applyTheaterFontStep(theaterFontStep - 1);
  });

  fontIncrease.addEventListener('click', (event) => {
    event.stopPropagation();
    applyTheaterFontStep(theaterFontStep + 1);
  });

  const resetLayerKind = () => {
    delete focusLayer.dataset.focusKind;
    focusLayer.classList.remove('is-opinion-focused');
  };

  const closeFocus = () => {
    if (!focusedSection || !placeholder) return;
    const parent = placeholder.parentElement;
    if (!parent) return;

    const section = focusedSection;
    const focusArtwork = section.querySelector<HTMLImageElement>('[data-auditorium-focus-art]');
    if (focusArtwork) focusArtwork.hidden = true;

    const bakedCloseButton = section.querySelector<HTMLButtonElement>('[data-auditorium-focus-close]');
    if (bakedCloseButton) bakedCloseButton.tabIndex = -1;

    genericToolbar.hidden = true;
    genericClose.tabIndex = -1;
    readingToolbar.hidden = true;
    fontDecrease.tabIndex = -1;
    fontIncrease.tabIndex = -1;

    section.classList.remove('is-auditorium-focused', 'has-auditorium-focus-artwork');
    section.setAttribute('aria-expanded', 'false');
    parent.replaceChild(section, placeholder);

    focusedSection = null;
    placeholder = null;
    focusLayer.classList.remove('is-open');
    focusLayer.setAttribute('aria-hidden', 'true');
    resetLayerKind();
    document.documentElement.classList.remove('auditorium-focus-open');

    requestAnimationFrame(() => section.focus({ preventScroll: true }));
  };

  const openFocus = (section: HTMLElement) => {
    if (focusedSection) return;
    const parent = section.parentElement;
    if (!parent) return;

    const kind = (section.dataset.auditoriumFocusable ?? 'theater') as AuditoriumFocusKind;
    const rect = section.getBoundingClientRect();

    placeholder = document.createElement('div');
    placeholder.className = 'auditorium-focus-placeholder';
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    parent.insertBefore(placeholder, section);

    focusedSection = section;
    focusStage.appendChild(section);
    section.classList.add('is-auditorium-focused');
    section.setAttribute('aria-expanded', 'true');

    const focusArtwork = section.querySelector<HTMLImageElement>('[data-auditorium-focus-art]');
    if (focusArtwork) {
      focusArtwork.hidden = false;
      section.classList.add('has-auditorium-focus-artwork');
    }

    focusLayer.dataset.focusKind = kind;
    focusLayer.classList.toggle('is-opinion-focused', kind === 'opinion');
    focusLayer.setAttribute('aria-label', `Enlarged ${FOCUS_LABELS[kind]}`);

    const usesGenericExit = GENERIC_EXIT_KINDS.has(kind);
    genericToolbar.hidden = !usesGenericExit;
    genericTitle.textContent = FOCUS_LABELS[kind];
    genericClose.tabIndex = usesGenericExit ? 0 : -1;

    const isTheater = kind === 'theater';
    readingToolbar.hidden = !isTheater;
    fontDecrease.tabIndex = isTheater ? 0 : -1;
    fontIncrease.tabIndex = isTheater ? 0 : -1;

    focusLayer.classList.add('is-open');
    focusLayer.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('auditorium-focus-open');

    const bakedCloseButton = section.querySelector<HTMLButtonElement>('[data-auditorium-focus-close]');
    if (bakedCloseButton) {
      bakedCloseButton.tabIndex = 0;
      requestAnimationFrame(() => bakedCloseButton.focus({ preventScroll: true }));
    } else if (usesGenericExit) {
      requestAnimationFrame(() => genericClose.focus({ preventScroll: true }));
    }
  };

  genericClose.addEventListener('click', (event) => {
    event.stopPropagation();
    closeFocus();
  });

  focusableSections.forEach((section) => {
    section.addEventListener('click', (event) => {
      if (focusedSection === section) return;
      const target = event.target;
      if (target instanceof Element && target.closest('a, button, input, textarea, select, label')) return;
      openFocus(section);
    });

    section.addEventListener('keydown', (event) => {
      if (event.target !== section) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openFocus(section);
    });

    section.querySelector<HTMLButtonElement>('[data-auditorium-focus-close]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      closeFocus();
    });
  });

  focusLayer.addEventListener('click', (event) => {
    if (event.target === focusLayer || event.target === focusStage) closeFocus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && focusedSection) closeFocus();
  });
}
