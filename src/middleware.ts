import { defineMiddleware } from 'astro:middleware';

const permissionsPolicy = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
].join(', ');

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const headers = response.headers;

  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', permissionsPolicy);
  headers.set('cross-origin-opener-policy', 'same-origin');

  if (!context.url.hostname.endsWith('.workers.dev')) {
    headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }

  return response;
});
