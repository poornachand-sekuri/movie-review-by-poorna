import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'movie-review-by-poorna',
      environment: 'staging',
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
};
