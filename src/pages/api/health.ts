import type { APIRoute } from 'astro';
import { jsonResponse } from '../../lib/http/json';

export const prerender = false;

export const GET: APIRoute = ({ url }) => jsonResponse({
  status: 'ok',
  service: 'movie-review-by-poorna',
  environment: url.hostname.endsWith('.workers.dev') ? 'preview'
    : ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? 'local' : 'production',
});
