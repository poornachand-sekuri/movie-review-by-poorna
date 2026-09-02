/* Content V3 canonical runtime.
   One module owns navigation consistency, POV fitting, the theater expand cue
   and the Share Your Opinion popover. */

const HOME_URL = '/';
let povResizeTimer = 0;

function waitForContent() {
  const existing = document.querySelector('.content-v3');
  if (existing) return Promise.resolve(existing);
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const root = document.querySelector('.content-v3');
      if (!root) return;
      observer.disconnect();
      resolve(root);
    });
    observer.observe(document.documentElement, { childList:true, subtree:true });
  });
}

function fits(node) {
  return node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1;
}

function binaryFit(node, low, high, lineHeight, iterations = 16) {
  let best = low;
  node.style.lineHeight = String(lineHeight);
  for (let i = 0; i < iterations; i += 1) {
    const mid = (low + high) / 2;
    node.style.fontSize = `${mid}px`;
    if (fits(node)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  node.style.fontSize = `${best}px`;
}

function fitPov(pov) {
  if (!pov?.isConnected || !pov.textContent.trim() || !pov.clientWidth || !pov.clientHeight) return;

  pov.style.display = 'block';
  pov.style.webkitLineClamp = 'unset';
  pov.style.webkitBoxOrient = 'initial';
  pov.style.overflow = 'hidden';
  pov.style.removeProperty('font-size');
  pov.style.removeProperty('line-height');

  const preferred = Number.parseFloat(getComputedStyle(pov).fontSize) || 11;
  const softFloor = Math.max(8.6, preferred * 0.80);
  const emergencyFloor = Math.max(7.2, preferred * 0.67);
  const stages = [
    { line:1.18, floor:softFloor },
    { line:1.13, floor:softFloor },
    { line:1.08, floor:emergencyFloor }
  ];

  for (const stage of stages) {
    pov.style.lineHeight = String(stage.line);
    pov.style.fontSize = `${preferred}px`;
    if (fits(pov)) { pov.dataset.povFit = 'preferred'; return; }
    pov.style.fontSize = `${stage.floor}px`;
    if (fits(pov)) {
      binaryFit(pov, stage.floor, preferred, stage.line);
      pov.dataset.povFit = stage.floor === softFloor ? 'fitted' : 'compact';
      return;
    }
  }

  pov.style.lineHeight = '1.05';
  binaryFit(pov, 6.4, Math.max(7.2, emergencyFloor), 1.05, 14);
  pov.dataset.povFit = 'emergency';
}

function mountPov(root) {
  const pov = root.querySelector('.cv3-pov');
  const clapboard = root.querySelector('.cv3-clapboard');
  if (!pov || !clapboard || pov.dataset.canonicalPovMounted === 'true') return;
  pov.dataset.canonicalPovMounted = 'true';

  const schedule = () => requestAnimationFrame(() => fitPov(pov));
  schedule();
  document.fonts?.ready?.then(() => { schedule(); setTimeout(schedule, 80); }).catch(() => {});

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    observer.observe(clapboard);
  }

  window.addEventListener('resize', () => {
    clearTimeout(povResizeTimer);
    povResizeTimer = window.setTimeout(schedule, 140);
  }, { passive:true });
  window.addEventListener('orientationchange', schedule, { passive:true });
}

function installNavigation(root) {
  document.addEventListener('click', event => {
    const menu = event.target.closest?.('#cv3Menu');
    if (!menu) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(HOME_URL);
  }, true);

  const top = root.querySelector('.cv3-topnav');
  if (top && !top.querySelector('.cv3-logo-hit')) {
    const logo = document.createElement('a');
    logo.className = 'cv3-logo-hit';
    logo.href = HOME_URL;
    logo.setAttribute('aria-label', 'Go to Home');
    top.append(logo);
  }
  root.querySelector('#cv3Menu')?.setAttribute('aria-label', 'Go to Home');
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
  if (!comments || !sourceList || !sourceForm || comments.dataset.canonicalPopoverMounted === 'true') return;
  comments.dataset.canonicalPopoverMounted = 'true';

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
  new MutationObserver(syncList).observe(sourceList, { childList:true, subtree:true, characterData:true });

  const setTab = name => {
    tabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
    panels.forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    if (name === 'add') requestAnimationFrame(() => nameInput?.focus());
  };
  const open = tab => {
    syncList();
    setTab(tab);
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
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
    new MutationObserver(syncStatus).observe(sourceStatus, { childList:true, subtree:true, characterData:true });
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

async function install() {
  const root = await waitForContent();
  installNavigation(root);
  installExpandCue(root);
  mountPov(root);
  installCommentsPopover(root);
}

install().catch(error => console.error('Unable to install Content V3 canonical runtime:', error));
