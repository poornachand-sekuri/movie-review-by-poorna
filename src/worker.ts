import { handle } from '@astrojs/cloudflare/handler';
import { DurableObject } from 'cloudflare:workers';
import { readLegacyVotePage } from './lib/legacy-reaction-reader';

/**
 * Compatibility exports for the pre-Astro production Worker.
 *
 * These classes intentionally remain exported during the D1 cutover so
 * Cloudflare keeps the existing Durable Object namespaces and their stored
 * data intact. ReactionStore retains its historical read-only, binding-only
 * export, but application requests no longer import old votes after the
 * owner-authorized fresh start. All new votes are written exclusively to D1.
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
