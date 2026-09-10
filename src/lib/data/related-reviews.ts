import type { ReviewDetail, ReviewSummary } from '../../domain/review';
import { listRelatedReviewsByCredits, listRelatedReviewFallback } from './reviews';

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
  const excludedIds = () => [review.id, ...selected.map(item => item.id)];

  if (selected.length < requestedLimit && review.language) {
    selected.push(...await listRelatedReviewFallback(excludedIds(), requestedLimit - selected.length, review.language));
  }

  if (selected.length < requestedLimit) {
    selected.push(...await listRelatedReviewFallback(excludedIds(), requestedLimit - selected.length));
  }

  return selected.slice(0, requestedLimit);
}
