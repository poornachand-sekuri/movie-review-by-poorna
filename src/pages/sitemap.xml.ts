import type { APIRoute } from 'astro';
import { listReviews } from '../lib/data/reviews';

export const prerender = false;

const ORIGIN = 'https://moviereviewbypoorna.com';
const PAGE_SIZE = 60;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const GET: APIRoute = async ({ url }) => {
  if (url.hostname.endsWith('.workers.dev')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const reviews = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await listReviews({ limit: PAGE_SIZE, offset });
    reviews.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const urls = [
    { loc: `${ORIGIN}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${ORIGIN}/search`, priority: '0.8', changefreq: 'weekly' },
    ...reviews.map((review) => ({
      loc: `${ORIGIN}/review/${encodeURIComponent(review.slug)}`,
      lastmod: review.reviewedDate,
      priority: '0.7',
      changefreq: 'monthly',
    })),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${'lastmod' in entry ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : ''}\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;

  return new Response(body, {
    status: 200,
    headers: {
      'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
      'content-type': 'application/xml; charset=utf-8',
    },
  });
};
