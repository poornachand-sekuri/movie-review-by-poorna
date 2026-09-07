const SHARE_SELECTOR = '.auditorium-section--share';

function reviewTitle(): string {
  const heading = document.querySelector<HTMLElement>('.auditorium-page > h1.visually-hidden');
  const raw = heading?.textContent?.trim() || document.title || 'Movie Review By Poorna';
  return raw.replace(/\s+—\s+The Auditorium(?:\s*\|.*)?$/u, '').trim() || 'Movie Review By Poorna';
}

function shareMessages(title: string, url: string) {
  return {
    plain: `🎬 ${title}\n\nFound this take quite interesting.\n\nCheck out Poorna’s POV 👇\n${url}`,
    whatsapp: `🎬 *${title}*\n\nFound this take quite interesting.\n\nCheck out *Poorna’s POV* 👇\n${url}`,
  };
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard unavailable');
}

async function nativeShare(text: string): Promise<boolean> {
  if (!navigator.share) return false;
  await navigator.share({ text });
  return true;
}

function announce(root: HTMLElement, message: string): void {
  const status = root.querySelector<HTMLElement>('[data-auditorium-share-status]');
  if (!status) return;
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) status.textContent = '';
  }, 2200);
}

function button(kind: string, label: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `auditorium-share-hit auditorium-share-hit--${kind}`;
  element.dataset.auditoriumShare = kind;
  element.setAttribute('aria-label', label);
  element.title = label;
  return element;
}

export function initAuditoriumSharing(): void {
  const root = document.querySelector<HTMLElement>(SHARE_SELECTOR);
  if (!root || root.dataset.auditoriumSharingReady === 'true') return;
  root.dataset.auditoriumSharingReady = 'true';

  const actions = document.createElement('div');
  actions.className = 'auditorium-share-actions';
  actions.setAttribute('aria-label', 'Share this review');
  actions.appendChild(button('whatsapp', 'Share this review on WhatsApp'));
  actions.appendChild(button('x', 'Share this review on X'));
  actions.appendChild(button('instagram', 'Share this review using Instagram'));
  actions.appendChild(button('copy', 'Copy review link'));
  actions.appendChild(button('more', 'More share options'));

  const status = document.createElement('span');
  status.className = 'visually-hidden';
  status.dataset.auditoriumShareStatus = '';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  root.appendChild(actions);
  root.appendChild(status);

  actions.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;

    const kind = target.dataset.auditoriumShare;
    if (!kind) return;

    const url = window.location.href;
    const title = reviewTitle();
    const messages = shareMessages(title, url);

    try {
      if (kind === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`, '_blank', 'noopener,noreferrer');
        return;
      }

      if (kind === 'x') {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(messages.plain)}`, '_blank', 'noopener,noreferrer');
        return;
      }

      if (kind === 'copy') {
        await copyText(url);
        announce(root, 'Review link copied');
        return;
      }

      if (kind === 'instagram') {
        if (!(await nativeShare(messages.plain))) {
          await copyText(messages.plain);
          announce(root, 'Share text copied for Instagram');
        }
        return;
      }

      if (!(await nativeShare(messages.plain))) {
        await copyText(messages.plain);
        announce(root, 'Share text copied');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      announce(root, 'Unable to share right now');
    }
  });
}
