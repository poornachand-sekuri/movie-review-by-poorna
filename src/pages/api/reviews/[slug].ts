import type { APIRoute } from 'astro';
import { getReviewBySlug } from '../../../lib/data/reviews';
import { apiError, jsonResponse } from '../../../lib/http/json';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug?.trim();
  if (!slug) return apiError(400, 'INVALID_REVIEW_SLUG', 'A review slug is required.');

  try {
    const review = await getReviewBySlug(slug);
    if (!review) return apiError(404, 'REVIEW_NOT_FOUND', 'Review not found.');

    return jsonResponse({ review });
  } catch (error) {
    console.error(`Failed to load review: ${slug}`, error);
    return apiError(500, 'REVIEW_LOAD_FAILED', 'Unable to load this review.');
  }
};
