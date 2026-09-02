const HOME_URL = '/';

function installNavigationConsistency() {
  document.addEventListener('click', event => {
    const menu = event.target.closest?.('#cv3Menu');
    if (!menu) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(HOME_URL);
  }, true);

  const top = document.querySelector('.cv3-topnav');
  if (top && !top.querySelector('.cv3-logo-hit')) {
    const logo = document.createElement('a');
    logo.className = 'cv3-logo-hit';
    logo.href = HOME_URL;
    logo.setAttribute('aria-label', 'Go to Home');
    top.append(logo);
  }

  const menu = document.querySelector('#cv3Menu');
  if (menu) menu.setAttribute('aria-label', 'Go to Home');
}

function installExpandCue(root) {
  const theater = root.querySelector('.cv3-theater');
  if (!theater || theater.querySelector('.cv3-expand-cue')) return;
  const cue = document.createElement('span');
  cue.className = 'cv3-expand-cue';
  cue.textContent = 'Tap to Expand Review';
  cue.setAttribute('aria-hidden', 'true');
  theater.append(cue);
}

function cloneCommentPreview(source, target) {
  target.replaceChildren(...[...source.children].map(node => node.cloneNode(true)));
}

function installCommentsPopover(root) {
  const comments = root.querySelector('.cv3-comments');
  const sourceList = comments?.querySelector('.comment-list');
  const sourceForm = comments?.querySelector('.comment-form');
  const sourceStatus = sourceForm?.querySelector('.comment-status');
  if (!comments || !sourceList || !sourceForm || comments.dataset.popoverMounted === 'true') return;
  comments.dataset.popoverMounted = 'true';

  const recentTrigger = document.createElement('button');
  recentTrigger.type = 'button';
  recentTrigger.className = 'cv3-comments-open cv3-comments-open-recent';
  recentTrigger.setAttribute('aria-label', 'Open recent comments');

  const addTrigger = document.createElement('button');
  addTrigger.type = 'button';
  addTrigger.className = 'cv3-comments-open cv3-comments-open-add';
  addTrigger.setAttribute('aria-label', 'Open add comment form');
  comments.append(recentTrigger, addTrigger);

  const dialog = document.createElement('dialog');
  dialog.className = 'cv3-comments-popover';
  dialog.setAttribute('aria-label', 'Share your opinion');
  dialog.innerHTML = `
    <div class="cv3-comments-popover-shell">
      <header class="cv3-comments-popover-head">
        <h2 class="cv3-comments-popover-title">Share Your Opinion</h2>
        <button class="cv3-comments-popover-close" type="button" aria-label="Close comments">×</button>
      </header>
      <div class="cv3-comments-popover-tabs" role="tablist" aria-label="Comments options">
        <button class="cv3-comments-popover-tab" type="button" role="tab" data-tab="recent">Recent Comments</button>
        <button class="cv3-comments-popover-tab" type="button" role="tab" data-tab="add">Add Comment</button>
      </div>
      <section class="cv3-comments-popover-panel" data-panel="recent" role="tabpanel">
        <div class="cv3-comments-popover-list"></div>
      </section>
      <section class="cv3-comments-popover-panel" data-panel="add" role="tabpanel" hidden>
        <form class="cv3-comments-popover-form">
          <label for="cv3PopoverName">Your Name</label>
          <input id="cv3PopoverName" name="name" required maxlength="60" autocomplete="name" placeholder="Name">
          <label for="cv3PopoverComment">Your Comment</label>
          <textarea id="cv3PopoverComment" name="comment" required maxlength="1200" placeholder="Write your comment…"></textarea>
          <button class="cv3-comments-popover-submit" type="submit">Submit Comment</button>
          <p class="cv3-comments-popover-status" role="status"></p>
        </form>
      </section>
    </div>`;
  document.body.append(dialog);

  const popoverList = dialog.querySelector('.cv3-comments-popover-list');
  const popoverForm = dialog.querySelector('.cv3-comments-popover-form');
  const popoverStatus = dialog.querySelector('.cv3-comments-popover-status');
  const nameInput = popoverForm.elements.namedItem('name');
  const commentInput = popoverForm.elements.namedItem('comment');
  const tabs = [...dialog.querySelectorAll('.cv3-comments-popover-tab')];
  const panels = [...dialog.querySelectorAll('.cv3-comments-popover-panel')];

  const syncList = () => cloneCommentPreview(sourceList, popoverList);
  syncList();
  new MutationObserver(syncList).observe(sourceList, { childList: true, subtree: true, characterData: true });

  const setTab = name => {
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    if (name === 'add') requestAnimationFrame(() => nameInput?.focus());
  };

  const open = tab => {
    syncList();
    setTab(tab);
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  };

  const close = () => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  };

  recentTrigger.addEventListener('click', event => { event.preventDefault(); open('recent'); });
  addTrigger.addEventListener('click', event => { event.preventDefault(); open('add'); });
  dialog.querySelector('.cv3-comments-popover-close')?.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  tabs.forEach(tab => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

  if (sourceStatus) {
    const syncStatus = () => {
      const message = sourceStatus.textContent.trim();
      if (!message) return;
      popoverStatus.textContent = message;
      if (/thank you/i.test(message)) popoverForm.reset();
    };
    new MutationObserver(syncStatus).observe(sourceStatus, { childList: true, subtree: true, characterData: true });
  }

  popoverForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!popoverForm.reportValidity()) return;

    const originalName = sourceForm.elements.namedItem('name');
    const originalComment = sourceForm.elements.namedItem('comment');
    if (!originalName || !originalComment) {
      popoverStatus.textContent = 'Comment form is temporarily unavailable.';
      return;
    }

    originalName.value = String(nameInput.value || '').trim();
    originalComment.value = String(commentInput.value || '').trim();
    popoverStatus.textContent = 'Submitting…';
    sourceForm.requestSubmit();
  });
}

function install() {
  const root = document.querySelector('.content-v3');
  if (!root) return false;
  installNavigationConsistency();
  installExpandCue(root);
  installCommentsPopover(root);
  return true;
}

if (!install()) {
  const observer = new MutationObserver(() => {
    if (!install()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
