import type { APIRoute } from 'astro';
import { listReviews } from '../../../lib/data/reviews';
import { apiError, jsonResponse, parseBoundedInteger } from '../../../lib/http/json';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  try {
    const limit = parseBoundedInteger(url.searchParams.get('limit'), 24, 1, 60);
    const offset = parseBoundedInteger(url.searchParams.get('offset'), 0, 0, 10_000);
    const language = url.searchParams.get('language')?.trim() || undefined;

    const items = await listReviews({
      limit,
      offset,
      ...(language ? { language } : {}),
    });

    return jsonResponse({
      items,
      paging: {
        limit,
        offset,
        returned: items.length,
      },
    });
  } catch (error) {
    console.error('Failed to list reviews', error);
    return apiError(500, 'REVIEW_LIST_FAILED', 'Unable to load reviews.');
  }
};
