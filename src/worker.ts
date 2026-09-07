import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';

/**
 * Compatibility exports for the pre-Astro production Worker.
 *
 * These classes intentionally remain exported during the D1 cutover so
 * Cloudflare keeps the existing Durable Object namespaces and their stored
 * data intact. The rebuilt application has no bindings to these classes and
 * does not read or write them.
 */
export class ReactionStore extends DurableObject<Env> {}
export class CommentsStore extends DurableObject<Env> {}
export class AnalyticsStore extends DurableObject<Env> {}

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
