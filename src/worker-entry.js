import worker, {
  ReactionStore,
  CommentsStore,
  AnalyticsStore
} from './worker.js';
import { adminIsAuthenticated } from './admin-console.js';

export { ReactionStore, CommentsStore, AnalyticsStore };

let derivedSessionSecretPromise;

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

async function derivedSessionSecret(password) {
  if (!derivedSessionSecretPromise) {
    derivedSessionSecretPromise = crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`movie-reviews-by-poorna:admin-session:v1:${password}`)
    ).then(buffer => hex(new Uint8Array(buffer)));
  }
  return derivedSessionSecretPromise;
}

async function runtimeEnv(env) {
  if (env.ADMIN_SESSION_SECRET || !env.ADMIN_PASSWORD) return env;
  const fallback = await derivedSessionSecret(String(env.ADMIN_PASSWORD));
  return new Proxy(env, {
    get(target, property, receiver) {
      if (property === 'ADMIN_SESSION_SECRET') return fallback;
      return Reflect.get(target, property, receiver);
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const runtime = await runtimeEnv(env);
    const url = new URL(request.url);

    // Any public page viewed while this browser has a valid Admin session is an
    // operational visit (Preview / View Site / manual Admin browsing), not audience traffic.
    if (url.pathname === '/api/analytics/pageview' && request.method === 'POST') {
      if (await adminIsAuthenticated(request, runtime)) {
        return json({ tracked: false, excluded: 'admin-session' });
      }
    }

    return worker.fetch(request, runtime, ctx);
  }
};
