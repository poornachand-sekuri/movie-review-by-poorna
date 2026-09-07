import type { ReviewDetail, ReviewSummary } from '../../domain/review';
import { listRelatedReviewsByCredits, listReviews } from './reviews';

const DEFAULT_RELATED_LIMIT = 4;
const MAX_RELATED_LIMIT = 4;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_RELATED_LIMIT;
  return Math.min(MAX_RELATED_LIMIT, Math.max(1, Math.trunc(limit)));
}

/**
 * Builds the public Related Reviews strip in its required priority order:
 * credit matches first, then same-language recency, then general recency.
 */
export async function listRelatedReviews(
  review: Pick<ReviewDetail, 'id' | 'slug' | 'language'>,
  limit = DEFAULT_RELATED_LIMIT,
): Promise<readonly ReviewSummary[]> {
  const requestedLimit = normalizeLimit(limit);
  const selected = [...(await listRelatedReviewsByCredits(review.id, requestedLimit))];
  const seenSlugs = new Set([review.slug, ...selected.map((item) => item.slug)]);

  const appendUnique = (items: readonly ReviewSummary[]) => {
    for (const item of items) {
      if (seenSlugs.has(item.slug)) continue;
      selected.push(item);
      seenSlugs.add(item.slug);
      if (selected.length >= requestedLimit) break;
    }
  };

  if (selected.length < requestedLimit && review.language) {
    appendUnique(await listReviews({ limit: 20, language: review.language }));
  }

  if (selected.length < requestedLimit) {
    appendUnique(await listReviews({ limit: 24 }));
  }

  return selected.slice(0, requestedLimit);
}
