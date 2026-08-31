import worker, {
  ReactionStore,
  CommentsStore,
  AnalyticsStore
} from './worker.js';

export { ReactionStore, CommentsStore, AnalyticsStore };

let derivedSessionSecretPromise;

function hex(bytes) {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
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
    return worker.fetch(request, await runtimeEnv(env), ctx);
  }
};
