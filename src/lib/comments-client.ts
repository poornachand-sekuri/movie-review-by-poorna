interface PublicCommentPayload {
  id: number;
  targetType: 'lounge' | 'review';
  targetId: string;
  name: string;
  comment: string;
  createdAt: string;
  approvedAt: string | null;
}

interface CommentsResponse {
  comments?: PublicCommentPayload[];
  error?: { message?: string };
}

interface CommentSubmitResponse {
  ok?: boolean;
  status?: string;
  message?: string;
  error?: { message?: string };
}

const COMMENTS_ENDPOINT = '/api/comments';

function formatCommentDate(value: string): string {
  const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function createCommentCard(comment: PublicCommentPayload): HTMLElement {
  const card = document.createElement('article');
  card.className = 'comment-card';

  const header = document.createElement('div');
  header.className = 'comment-card__header';

  const name = document.createElement('strong');
  name.className = 'comment-card__name';
  name.textContent = comment.name || 'Movie Lover';

  const time = document.createElement('time');
  time.className = 'comment-card__date';
  time.dateTime = comment.approvedAt || comment.createdAt;
  time.textContent = formatCommentDate(comment.approvedAt || comment.createdAt);

  const body = document.createElement('p');
  body.className = 'comment-card__body';
  body.textContent = comment.comment;

  header.append(name, time);
  card.append(header, body);
  return card;
}

function paintComments(root: HTMLElement, comments: PublicCommentPayload[]): void {
  const slots = [...root.querySelectorAll<HTMLElement>('[data-comment-slot]')];
  if (slots.length === 0) return;

  slots.forEach((slot) => {
    slot.replaceChildren();
    slot.setAttribute('aria-hidden', 'true');
  });

  const visible = comments.slice(0, slots.length);
  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'comments-empty';
    empty.textContent = 'No approved comments yet. Be the first to share your opinion.';
    slots[0].appendChild(empty);
    slots[0].setAttribute('aria-hidden', 'false');
    return;
  }

  visible.forEach((comment, index) => {
    slots[index].appendChild(createCommentCard(comment));
    slots[index].setAttribute('aria-hidden', 'false');
  });
}

let toastTimer: number | undefined;

function showToast(message: string, tone: 'success' | 'error' = 'success'): void {
  let toast = document.querySelector<HTMLElement>('[data-comment-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'comments-toast';
    toast.dataset.commentToast = '';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.dataset.tone = tone;
  toast.textContent = message;
  toast.classList.add('is-visible');
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast?.classList.remove('is-visible');
    toastTimer = undefined;
  }, 4200);
}

async function loadComments(root: HTMLElement): Promise<void> {
  const target = root.dataset.commentTarget;
  const targetId = root.dataset.commentTargetId;
  if ((target !== 'lounge' && target !== 'review') || !targetId) return;

  const params = new URLSearchParams({
    target,
    target_id: targetId,
    limit: String(root.querySelectorAll('[data-comment-slot]').length || 2),
  });

  try {
    const response = await fetch(`${COMMENTS_ENDPOINT}?${params.toString()}`, {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Unable to load comments.');

    const payload = (await response.json()) as CommentsResponse;
    paintComments(root, Array.isArray(payload.comments) ? payload.comments : []);
  } catch {
    // Keep server-rendered approved comments when a refresh request temporarily fails.
  }
}

function mountCommentRoot(root: HTMLElement): void {
  if (root.dataset.commentsMounted === 'true') return;
  root.dataset.commentsMounted = 'true';

  const form = root.querySelector<HTMLFormElement>('[data-comments-form]');
  const status = root.querySelector<HTMLElement>('[data-comments-status]');
  const target = root.dataset.commentTarget;
  const targetId = root.dataset.commentTargetId;
  if (!form || (target !== 'lounge' && target !== 'review') || !targetId) return;

  void loadComments(root);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!form.reportValidity()) return;

    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    const comment = String(data.get('comment') ?? '').trim();
    const website = String(data.get('website') ?? '').trim();

    if (submit) submit.disabled = true;
    form.setAttribute('aria-busy', 'true');
    if (status) status.textContent = 'Submitting your comment…';

    try {
      const response = await fetch(COMMENTS_ENDPOINT, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          target,
          target_id: targetId,
          name,
          comment,
          website,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as CommentSubmitResponse;
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Unable to submit your comment right now.');
      }

      const message = payload.message || 'Thank you. Your comment is awaiting approval.';
      if (status) status.textContent = message;
      showToast(message, 'success');

      form.reset();
      const nameInput = form.elements.namedItem('name');
      if (nameInput instanceof HTMLInputElement) nameInput.value = name;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to submit your comment right now.';
      if (status) status.textContent = message;
      showToast(message, 'error');
    } finally {
      form.removeAttribute('aria-busy');
      if (submit) submit.disabled = false;
    }
  });
}

export function initComments(): void {
  document.querySelectorAll<HTMLElement>('[data-comments-root]').forEach(mountCommentRoot);
}
