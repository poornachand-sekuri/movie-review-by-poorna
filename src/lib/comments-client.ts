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

function addHoneypot(form: HTMLFormElement, idPrefix: string): void {
  if (form.elements.namedItem('website')) return;

  const label = document.createElement('label');
  label.className = 'comments-honeypot';
  label.htmlFor = `${idPrefix}-website`;
  label.textContent = 'Website';

  const input = document.createElement('input');
  input.id = `${idPrefix}-website`;
  input.className = 'comments-honeypot';
  input.type = 'text';
  input.name = 'website';
  input.tabIndex = -1;
  input.autocomplete = 'off';
  input.setAttribute('aria-hidden', 'true');

  form.append(label, input);
}

function prepareLoungeRoot(): void {
  const root = document.querySelector<HTMLElement>('#share-your-opinion.lounge-panel--opinion');
  if (!root) return;

  root.dataset.commentsRoot = '';
  root.dataset.commentTarget = 'lounge';
  root.dataset.commentTargetId = 'lounge';

  const form = root.querySelector<HTMLFormElement>('[data-opinion-form]');
  if (!form) return;
  form.dataset.commentsForm = '';

  const name = form.elements.namedItem('name');
  if (name instanceof HTMLInputElement) {
    name.required = true;
    name.minLength = 2;
  }

  const comment = form.elements.namedItem('comment');
  if (comment instanceof HTMLTextAreaElement) {
    comment.required = true;
    comment.minLength = 2;
  }

  const status = root.querySelector<HTMLElement>('[data-opinion-status]');
  if (status) status.dataset.commentsStatus = '';
  addHoneypot(form, 'lounge-comment');
}

function buildAuditoriumComments(root: HTMLElement, slug: string): void {
  if (root.querySelector('[data-comments-form]')) return;

  root.dataset.commentsRoot = '';
  root.dataset.commentTarget = 'review';
  root.dataset.commentTargetId = slug;

  const commentsWindow = document.createElement('div');
  commentsWindow.className = 'auditorium-comments-window';
  commentsWindow.dataset.commentsList = '';
  commentsWindow.setAttribute('role', 'region');
  commentsWindow.setAttribute('aria-label', 'Recent approved comments');
  commentsWindow.setAttribute('aria-live', 'polite');

  for (let index = 1; index <= 2; index += 1) {
    const slot = document.createElement('div');
    slot.className = `auditorium-comment-slot auditorium-comment-slot--${index}`;
    slot.dataset.commentSlot = String(index);
    slot.setAttribute('aria-hidden', index === 1 ? 'false' : 'true');
    if (index === 1) {
      const empty = document.createElement('p');
      empty.className = 'comments-empty';
      empty.textContent = 'No approved comments yet. Be the first to share your opinion.';
      slot.appendChild(empty);
    }
    commentsWindow.appendChild(slot);
  }

  const form = document.createElement('form');
  form.className = 'auditorium-opinion-form';
  form.dataset.commentsForm = '';
  form.noValidate = false;

  const nameLabel = document.createElement('label');
  nameLabel.className = 'visually-hidden';
  nameLabel.htmlFor = 'auditorium-comment-name';
  nameLabel.textContent = 'Your name';

  const name = document.createElement('input');
  name.id = 'auditorium-comment-name';
  name.name = 'name';
  name.maxLength = 80;
  name.minLength = 2;
  name.required = true;
  name.placeholder = 'Your name';
  name.autocomplete = 'name';

  const commentLabel = document.createElement('label');
  commentLabel.className = 'visually-hidden';
  commentLabel.htmlFor = 'auditorium-comment-text';
  commentLabel.textContent = 'Your comment';

  const comment = document.createElement('textarea');
  comment.id = 'auditorium-comment-text';
  comment.name = 'comment';
  comment.maxLength = 1500;
  comment.minLength = 2;
  comment.required = true;
  comment.placeholder = 'Your comment';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.setAttribute('aria-label', 'Submit comment for approval');

  const status = document.createElement('p');
  status.className = 'visually-hidden';
  status.dataset.commentsStatus = '';
  status.setAttribute('aria-live', 'polite');

  form.append(nameLabel, name, commentLabel, comment, submit, status);
  addHoneypot(form, 'auditorium-comment');
  root.append(commentsWindow, form);
}

function prepareAuditoriumRoot(): void {
  const root = document.querySelector<HTMLElement>('[data-auditorium-opinion]');
  if (!root) return;

  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'review' || !parts[1]) return;

  let slug = parts[1];
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // Keep the URL segment as-is if it is not percent encoded correctly.
  }

  buildAuditoriumComments(root, slug.slice(0, 180));
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
    // Retain the current display if the approved-comment refresh temporarily fails.
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
    event.stopImmediatePropagation();
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
  }, true);
}

export function initComments(): void {
  prepareLoungeRoot();
  prepareAuditoriumRoot();
  document.querySelectorAll<HTMLElement>('[data-comments-root]').forEach(mountCommentRoot);
}
