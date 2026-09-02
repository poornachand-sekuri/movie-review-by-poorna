const theater = document.querySelector('.cv3-review-section');

if (theater) {
  theater.tabIndex = 0;
  theater.setAttribute('role', 'button');
  theater.setAttribute('aria-label', 'Open full theater review reader');

  let placeholder = null;
  let modal = null;
  let shell = null;
  let closeButton = null;
  let restoreNextSibling = null;

  const reviewBody = () => theater.querySelector('.cv3-review-body');

  function openTheater() {
    if (modal) return;

    const rect = theater.getBoundingClientRect();
    const parent = theater.parentNode;
    restoreNextSibling = theater.nextSibling;

    placeholder = document.createElement('div');
    placeholder.className = 'cv3-theater-placeholder';
    placeholder.style.height = `${Math.max(1, rect.height)}px`;
    parent.insertBefore(placeholder, theater);

    modal = document.createElement('div');
    modal.className = 'cv3-theater-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Full theater review reader');

    shell = document.createElement('div');
    shell.className = 'cv3-theater-modal-shell';

    closeButton = document.createElement('button');
    closeButton.className = 'cv3-theater-modal-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close full review');
    closeButton.textContent = '×';

    theater.classList.add('cv3-theater-expanded');
    theater.removeAttribute('role');
    theater.removeAttribute('aria-label');
    theater.tabIndex = -1;

    shell.append(theater, closeButton);
    modal.append(shell);
    document.body.append(modal);
    document.documentElement.classList.add('cv3-theater-modal-open');
    document.body.classList.add('cv3-theater-modal-open');

    const body = reviewBody();
    if (body) body.scrollTop = 0;

    closeButton.addEventListener('click', closeTheater);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeTheater();
    });

    requestAnimationFrame(() => closeButton?.focus());
  }

  function closeTheater() {
    if (!modal || !placeholder?.parentNode) return;

    const parent = placeholder.parentNode;
    theater.classList.remove('cv3-theater-expanded');
    theater.tabIndex = 0;
    theater.setAttribute('role', 'button');
    theater.setAttribute('aria-label', 'Open full theater review reader');

    if (restoreNextSibling && restoreNextSibling.parentNode === parent) {
      parent.insertBefore(theater, restoreNextSibling);
    } else {
      parent.insertBefore(theater, placeholder.nextSibling);
    }

    placeholder.remove();
    modal.remove();
    document.documentElement.classList.remove('cv3-theater-modal-open');
    document.body.classList.remove('cv3-theater-modal-open');

    placeholder = null;
    modal = null;
    shell = null;
    closeButton = null;
    restoreNextSibling = null;

    const body = reviewBody();
    if (body) body.scrollTop = 0;
    requestAnimationFrame(() => theater.focus({ preventScroll: true }));
  }

  theater.addEventListener('click', () => {
    if (!theater.classList.contains('cv3-theater-expanded')) openTheater();
  });

  theater.addEventListener('keydown', event => {
    if (theater.classList.contains('cv3-theater-expanded')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTheater();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal) closeTheater();
  });
}
