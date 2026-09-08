import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';
import { readLegacyVotePage } from './lib/legacy-reaction-reader';

/**
 * Compatibility exports for the pre-Astro production Worker.
 *
 * These classes intentionally remain exported during the D1 cutover so
 * Cloudflare keeps the existing Durable Object namespaces and their stored
 * data intact. ReactionStore exposes a read-only, binding-only export for the
 * one-time D1 import. All new votes continue to be written exclusively to D1.
 */
export class ReactionStore extends DurableObject<Env> {
  async exportVotes(after = '') {
    return readLegacyVotePage(this.ctx.storage.sql, after);
  }
}
export class CommentsStore extends DurableObject<Env> {}
export class AnalyticsStore extends DurableObject<Env> {}

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
