import type { APIRoute } from 'astro';
import { searchReviews } from '../../lib/data/reviews';
import { apiError, jsonResponse, parseBoundedInteger } from '../../lib/http/json';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim() ?? '';
  if (!query) return jsonResponse({ query: '', items: [] });
  if (query.length > 120) return apiError(400, 'SEARCH_QUERY_TOO_LONG', 'Search query is too long.');

  try {
    const limit = parseBoundedInteger(url.searchParams.get('limit'), 20, 1, 40);
    const items = await searchReviews(query, { limit });

    return jsonResponse({
      query,
      items,
      returned: items.length,
    });
  } catch (error) {
    console.error(`Review search failed for query: ${query}`, error);
    return apiError(500, 'REVIEW_SEARCH_FAILED', 'Unable to search reviews.');
  }
};
