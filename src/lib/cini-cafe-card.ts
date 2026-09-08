import type { CiniCafeReview } from './data/cini-cafe';
import { yearOf } from './cini-cafe-filter';

function escapeHtml(value: unknown): string {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]!);
}

/** One escaped renderer for first-paint server cards and browser filtering. */
export function renderCafeCard(review: CiniCafeReview, index: number): string {
  const title = escapeHtml(review.title);
  const slug = escapeHtml(review.slug);
  const rating = Math.round(Number(review.rating) || 0);
  const stars = Math.max(0, Math.min(5, rating));
  const meta = escapeHtml([review.language, yearOf(review)].filter(Boolean).join(' • '));
  const likes = escapeHtml(review.likes);
  const poster = review.posterUrl
    ? `<img src="${escapeHtml(review.posterUrl)}" alt="${title} poster" loading="${index < 3 ? 'eager' : 'lazy'}" decoding="async">`
    : '';
  return `<article class="cini-cafe-review-card" data-review-slug="${slug}">
    <a class="cini-cafe-review-link" href="/review/${escapeHtml(encodeURIComponent(review.slug))}" aria-label="Read ${title} review">
      <div class="cini-cafe-poster-zone">${poster}</div>
      <div class="cini-cafe-review-info"><h2 class="cini-cafe-review-title" title="${title}">${title}</h2><p class="cini-cafe-review-meta">${meta}</p></div>
      <div class="cini-cafe-review-stars" aria-label="${rating} out of 5 stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</div>
      <div class="cini-cafe-review-likes" data-review-likes="${slug}" aria-label="${likes} like${review.likes === 1 ? '' : 's'}">${likes}</div>
    </a>
  </article>`;
}
