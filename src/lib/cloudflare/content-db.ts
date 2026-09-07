import { env } from 'cloudflare:workers';

export function getContentDb(): D1Database {
  return env.CONTENT_DB;
}
