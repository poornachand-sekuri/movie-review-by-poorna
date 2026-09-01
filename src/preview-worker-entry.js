import { handleDynamicData } from './admin-console.js';

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // The public validation build intentionally has no Durable Object bindings.
    // Keep the finalized pages and optimized data routes testable without reading
    // from or writing to production reactions, comments, or analytics storage.
    if (url.pathname === '/api/reactions') {
      if (request.method === 'GET') {
        return json({ like: 0, dislike: 0, myVote: null, preview: true });
      }
      return json({ error: 'Interactions are disabled in the validation preview.' }, 503);
    }

    if (url.pathname === '/api/comments') {
      if (request.method === 'GET') return json({ comments: [], preview: true });
      return json({ error: 'Comment submission is disabled in the validation preview.' }, 503);
    }

    if (url.pathname === '/api/analytics/pageview') {
      return json({ tracked: false, excluded: 'validation-preview' });
    }

    if (url.pathname.startsWith('/api/admin')) {
      return json({ error: 'Admin APIs are disabled in the validation preview.' }, 503);
    }

    const dynamicData = await handleDynamicData(request, env, url);
    if (dynamicData) return dynamicData;

    return env.ASSETS.fetch(request);
  }
};
