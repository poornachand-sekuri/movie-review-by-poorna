type ReactionKind = 'like' | 'dislike';

interface ReactionPayload {
  likes: number;
  dislikes: number;
  viewerReaction: ReactionKind | null;
}

function isReactionPayload(value: unknown): value is ReactionPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<ReactionPayload>;
  return (
    Number.isFinite(payload.likes) &&
    Number.isFinite(payload.dislikes) &&
    (payload.viewerReaction === null || payload.viewerReaction === 'like' || payload.viewerReaction === 'dislike')
  );
}

function applySnapshot(root: HTMLElement, snapshot: ReactionPayload): void {
  const likeCount = root.querySelector<HTMLElement>('[data-reaction-count="like"]');
  const dislikeCount = root.querySelector<HTMLElement>('[data-reaction-count="dislike"]');
  const likeButton = root.querySelector<HTMLButtonElement>('[data-reaction-action="like"]');
  const dislikeButton = root.querySelector<HTMLButtonElement>('[data-reaction-action="dislike"]');

  if (likeCount) likeCount.textContent = String(Math.max(0, Math.trunc(snapshot.likes)));
  if (dislikeCount) dislikeCount.textContent = String(Math.max(0, Math.trunc(snapshot.dislikes)));

  if (likeButton) {
    const selected = snapshot.viewerReaction === 'like';
    likeButton.setAttribute('aria-pressed', String(selected));
    likeButton.classList.toggle('is-selected', selected);
  }

  if (dislikeButton) {
    const selected = snapshot.viewerReaction === 'dislike';
    dislikeButton.setAttribute('aria-pressed', String(selected));
    dislikeButton.classList.toggle('is-selected', selected);
  }

  root.dataset.viewerReaction = snapshot.viewerReaction ?? '';
}

function setBusy(root: HTMLElement, busy: boolean): void {
  root.classList.toggle('is-updating', busy);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-reaction-action]')) {
    button.disabled = busy;
  }
}

export function initAuditoriumReactions(): void {
  const root = document.querySelector<HTMLElement>('[data-review-reactions]');
  if (!root || root.dataset.reactionsReady === 'true') return;

  const slug = root.dataset.reviewSlug?.trim();
  if (!slug) return;

  root.dataset.reactionsReady = 'true';
  const status = root.querySelector<HTMLElement>('[data-reaction-status]');
  const endpoint = `/api/reviews/${encodeURIComponent(slug)}/reactions`;

  let revision = 0;
  const loadLatest = async () => {
    const requestedRevision = revision;
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (requestedRevision === revision && isReactionPayload(payload)) applySnapshot(root, payload);
    } catch {
      // Server-rendered counts remain visible when a refresh request is unavailable.
    }
  };

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-reaction-action]')) {
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains('is-updating')) return;

      const reaction = button.dataset.reactionAction as ReactionKind | undefined;
      if (reaction !== 'like' && reaction !== 'dislike') return;

      revision += 1;
      setBusy(root, true);
      if (status) status.textContent = reaction === 'like' ? 'Updating like.' : 'Updating dislike.';

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ reaction }),
        });

        const payload: unknown = await response.json();
        if (!response.ok || !isReactionPayload(payload)) throw new Error('Reaction update failed.');

        revision += 1;
        applySnapshot(root, payload);
        root.classList.remove('just-updated');
        void root.offsetWidth;
        root.classList.add('just-updated');
        if (status) {
          status.textContent = payload.viewerReaction
            ? `${payload.viewerReaction === 'like' ? 'Like' : 'Dislike'} saved.`
            : 'Reaction removed.';
        }
      } catch {
        if (status) status.textContent = 'Could not update your reaction. Please try again.';
        await loadLatest();
      } finally {
        setBusy(root, false);
      }
    });
  }

  // The initial snapshot is rendered by the server. Refresh restored pages only.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void loadLatest();
  });
}
