import type { APIRoute } from 'astro';

export const prerender = false;

const PRODUCTION_ORIGIN = 'https://moviereviewbypoorna.com';

export const GET: APIRoute = ({ url }) => {
  const preview = url.hostname.endsWith('.workers.dev');
  const body = preview
    ? 'User-agent: *\nDisallow: /\n'
    : [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin/',
        'Disallow: /api/',
        `Sitemap: ${PRODUCTION_ORIGIN}/sitemap.xml`,
        '',
      ].join('\n');

  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': preview ? 'no-store' : 'public, max-age=3600',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
};
