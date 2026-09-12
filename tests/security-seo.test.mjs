import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createD1, installBindings } from './helpers/d1.mjs';

const db = createD1();
installBindings({ CONTENT_DB: db });
db.sqlite.exec(`
  INSERT INTO reviews(id,slug,title,reviewed_date,body_html,status) VALUES
    (1,'first-review','First Review','2026-09-10','<p>First</p>','published'),
    (2,'second-review','Second Review','2026-09-09','<p>Second</p>','published'),
    (3,'draft-review','Draft Review','2026-09-08','<p>Draft</p>','draft');
`);

const robotsRoute = await import('../src/pages/robots.txt.ts');
const sitemapRoute = await import('../src/pages/sitemap.xml.ts');

const siteFrame = readFileSync('src/layouts/SiteFrame.astro', 'utf8');
const reviewPage = readFileSync('src/pages/review/[slug].astro', 'utf8');
const middleware = readFileSync('src/middleware.ts', 'utf8');
const adminPage = readFileSync('src/pages/admin/index.ts', 'utf8');
const productionConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const previewConfig = JSON.parse(readFileSync('wrangler.preview.jsonc', 'utf8'));

test('admin login is protected by Cloudflare rate limiting in both deploy targets', () => {
  for (const config of [productionConfig, previewConfig]) {
    const binding = config.ratelimits?.find((item) => item.name === 'ADMIN_LOGIN_RATE_LIMITER');
    assert(binding, 'ADMIN_LOGIN_RATE_LIMITER binding is required');
    assert.equal(binding.simple.limit, 6);
    assert.equal(binding.simple.period, 60);
  }
});

test('global and Projector Room security policies remain enabled', () => {
  for (const header of ['x-content-type-options', 'x-frame-options', 'permissions-policy', 'strict-transport-security']) {
    assert(middleware.includes(header), `middleware missing ${header}`);
  }
  for (const directive of ['content-security-policy', "frame-ancestors 'none'", "object-src 'none'", "form-action 'self'"]) {
    assert(adminPage.includes(directive), `Projector Room missing ${directive}`);
  }
});

test('public pages keep canonical, Open Graph, Twitter and structured-data metadata', () => {
  for (const token of [
    'rel="canonical"', 'og:title', 'og:description', 'og:image', 'og:url',
    'twitter:card', 'twitter:image', 'application/ld+json', 'SearchAction',
  ]) assert(siteFrame.includes(token), `SiteFrame missing ${token}`);

  for (const token of ['socialImage={review.posterUrl}', 'ogType="article"', "'@type': 'Review'", "'@type': 'Movie'"]) {
    assert(reviewPage.includes(token), `Review SEO missing ${token}`);
  }
});

test('robots blocks preview and protects admin/API paths in production', async () => {
  const preview = await robotsRoute.GET({ url: new URL('https://example.workers.dev/robots.txt') });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /Disallow: \/\s*$/m);

  const production = await robotsRoute.GET({ url: new URL('https://moviereviewbypoorna.com/robots.txt') });
  const body = await production.text();
  assert.match(body, /Allow: \//);
  assert.match(body, /Disallow: \/admin\//);
  assert.match(body, /Disallow: \/api\//);
  assert.match(body, /Sitemap: https:\/\/moviereviewbypoorna\.com\/sitemap\.xml/);
});

test('production sitemap lists public pages and published reviews only', async () => {
  const response = await sitemapRoute.GET({ url: new URL('https://moviereviewbypoorna.com/sitemap.xml') });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/xml/);
  const body = await response.text();
  for (const path of ['/', '/search', '/review/first-review', '/review/second-review']) {
    assert(body.includes(`https://moviereviewbypoorna.com${path}`), `sitemap missing ${path}`);
  }
  assert(!body.includes('draft-review'));
  assert(!body.includes('/admin'));

  const preview = await sitemapRoute.GET({ url: new URL('https://example.workers.dev/sitemap.xml') });
  assert.equal(preview.status, 404);
});
