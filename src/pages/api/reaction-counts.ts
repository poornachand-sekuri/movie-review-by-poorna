import type { APIRoute } from 'astro';
import { listReviewReactionCounts, MAX_REACTION_COUNT_SLUGS } from '../../lib/data/reactions';
import { apiError, jsonResponse } from '../../lib/http/json';

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  const slugs = url.searchParams.getAll('slug').map(slug => slug.trim());
  if (slugs.length === 0 || slugs.length > MAX_REACTION_COUNT_SLUGS || slugs.some(slug => !slug || slug.length > 180)) {
    return apiError(400, 'INVALID_REVIEW_SLUGS', `Request between one and ${MAX_REACTION_COUNT_SLUGS} review slugs.`);
  }
  try {
    const legacyVoterKey = cookies.get('mrp_voter')?.value ?? null;
    const voterKey = cookies.get('mrp_reaction_voter')?.value ?? legacyVoterKey;
    const counts = await listReviewReactionCounts(slugs, voterKey, legacyVoterKey);
    return jsonResponse({ counts });
  } catch (error) {
    console.error('Failed to load review counts', error);
    return apiError(500, 'REACTION_LOAD_FAILED', 'Unable to load reaction counts right now.');
  }
};
