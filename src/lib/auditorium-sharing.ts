import { recordCinemaEvent } from './analytics-client';

const SHARE_SELECTOR = '.auditorium-section--share';
const PRODUCTION_ORIGIN = 'https://moviereviewbypoorna.com';

const SOCIAL_LINKS = {
  instagram: 'https://www.instagram.com/moviereviewbypoorna/',
  facebook: 'https://www.facebook.com/moviereviewbypoorna',
  x: 'https://x.com/reviewbypoorna',
  whatsapp: 'https://whatsapp.com/channel/0029VaKoQMp2UPBPOlNDg546',
} as const;

function reviewTitle(): string {
  const heading = document.querySelector<HTMLElement>('.auditorium-page > h1.visually-hidden');
  const raw = heading?.textContent?.trim() || document.title || 'Movie Review By Poorna';
  return raw.replace(/\s+—\s+The Auditorium(?:\s*\|.*)?$/u, '').trim() || 'Movie Review By Poorna';
}

function reviewSlug(): string {
  return decodeURIComponent(window.location.pathname.match(/^\/review\/([^/]+)/)?.[1] ?? 'review').slice(0, 100);
}

function productionReviewUrl(): string {
  return `${PRODUCTION_ORIGIN}${window.location.pathname}`;
}

function taggedReviewUrl(source: string, medium = 'share'): string {
  const url = new URL(productionReviewUrl());
  url.searchParams.set('utm_source', source);
  url.searchParams.set('utm_medium', medium);
  url.searchParams.set('utm_campaign', reviewSlug());
  return url.toString();
}

function shareMessages(title: string, source: string) {
  const url = taggedReviewUrl(source);
  return {
    plain: `🎬 ${title}\n\nFound this take quite interesting.\n\nCheck out Poorna’s POV 👇\n${url}`,
    whatsapp: `🎬 *${title}*\n\nFound this take quite interesting.\n\nCheck out *Poorna’s POV* 👇\n${url}\n\n🍿 Follow Movie Review By Poorna on WhatsApp:\n${SOCIAL_LINKS.whatsapp}`,
    x: `🎬 ${title}\n\nPoorna’s POV 👇\n${url}\n\nFollow @ReviewByPoorna\n${SOCIAL_LINKS.x}`,
    instagram: `🎬 ${title}\n\nFound this take quite interesting.\n\nCheck out Poorna’s POV 👇\n${url}\n\nFollow Movie Review By Poorna on Instagram:\n${SOCIAL_LINKS.instagram}`,
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
    recordCinemaEvent('review_share_click', kind);

    const title = reviewTitle();
    const messages = shareMessages(title, kind === 'more' ? 'shared' : kind);

    try {
      if (kind === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodeURIComponent(messages.whatsapp)}`, '_blank', 'noopener,noreferrer');
        return;
      }

      if (kind === 'x') {
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(messages.x)}`, '_blank', 'noopener,noreferrer');
        return;
      }

      if (kind === 'copy') {
        await copyText(productionReviewUrl());
        announce(root, 'Review link copied');
        return;
      }

      if (kind === 'instagram') {
        if (!(await nativeShare(messages.instagram))) {
          await copyText(messages.instagram);
          announce(root, 'Review text copied — paste it into Instagram');
          window.open(SOCIAL_LINKS.instagram, '_blank', 'noopener,noreferrer');
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
