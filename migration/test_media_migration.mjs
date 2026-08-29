import worker from '../src/worker-v2.js';

class MockBucket {
  constructor() { this.map = new Map(); }
  async put(key, value, options = {}) {
    let bytes;
    if (typeof value === 'string') bytes = new TextEncoder().encode(value);
    else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (ArrayBuffer.isView(value)) bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else throw new Error('Unsupported mock R2 value');
    this.map.set(key, { bytes: new Uint8Array(bytes), options });
  }
  async get(key) {
    const item = this.map.get(key);
    if (!item) return null;
    return {
      size: item.bytes.byteLength,
      text: async () => new TextDecoder().decode(item.bytes),
      arrayBuffer: async () => item.bytes.buffer.slice(item.bytes.byteOffset, item.bytes.byteOffset + item.bytes.byteLength)
    };
  }
  async head(key) {
    const item = this.map.get(key);
    return item ? { size: item.bytes.byteLength } : null;
  }
  async delete(key) { this.map.delete(key); }
}

const manifest = Array.from({ length: 137 }, (_, index) => ({
  i: index + 1,
  t: `Movie ${index + 1}`,
  s: index === 2 ? 'percent-%f0%9f%98%89' : `movie-${index + 1}`,
  m: `/wp-content/uploads/2026/08/image-${index + 1}.jpg`
}));

const bucket = new MockBucket();
const env = {
  ADMIN_SESSION_SECRET: 'test-secret',
  R2_PUBLIC_BASE: 'https://assets.moviereviewbypoorna.com',
  REVIEW_ASSETS: bucket,
  ASSETS: {
    fetch: async request => {
      const url = new URL(request.url);
      if (url.pathname === '/data/index.json') {
        return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    }
  }
};

globalThis.fetch = async value => {
  const url = new URL(String(value));
  if (url.hostname !== 'moviereviewbypoorna.wordpress.com') throw new Error(`Unexpected network target: ${url.hostname}`);
  return new Response(new Uint8Array([1, 2, 3, 4, 5]), {
    status: 200,
    headers: { 'content-type': 'image/jpeg', 'content-length': '5' }
  });
};

async function adminCookie(secret) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`admin:${exp}`)));
  const signature = Buffer.from(bytes).toString('base64url');
  return `mrp_admin=${exp}.${signature}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cookie = await adminCookie(env.ADMIN_SESSION_SECRET);

const unauthorized = await worker.fetch(
  new Request('https://example.test/api/admin/migration/media/status'),
  env,
  {}
);
assert(unauthorized.status === 401, `Expected unauthenticated status 401, got ${unauthorized.status}`);

const firstRun = await worker.fetch(
  new Request('https://example.test/api/admin/migration/media/run', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ limit: 2 })
  }),
  env,
  {}
);
assert(firstRun.status === 200, `First migration run failed: ${firstRun.status}`);
const firstData = await firstRun.json();
assert(firstData.processed === 2, `Expected 2 processed items, got ${firstData.processed}`);
assert(firstData.summary.catalog_total === 137, 'Expected the locked 137-item migration manifest');
assert(firstData.summary.verified === 2, `Expected 2 verified items, got ${firstData.summary.verified}`);
assert(firstData.summary.pending === 135, `Expected 135 pending items, got ${firstData.summary.pending}`);
assert(firstData.summary.failed === 0, `Expected 0 failures, got ${firstData.summary.failed}`);

const rerun = await worker.fetch(
  new Request('https://example.test/api/admin/migration/media/run', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ ids: [1, 2], limit: 2 })
  }),
  env,
  {}
);
const rerunData = await rerun.json();
assert(rerunData.results.every(item => item.status === 'verified' && item.skipped === true), 'Verified objects were not skipped idempotently');

const verifiedStatus = await worker.fetch(
  new Request('https://example.test/api/admin/migration/media/status?verify=1', { headers: { cookie } }),
  env,
  {}
);
assert(verifiedStatus.status === 200, `Verification status failed: ${verifiedStatus.status}`);
const statusData = await verifiedStatus.json();
assert(statusData.verified === 2, `Deep verification lost verified objects: ${statusData.verified}`);
assert(statusData.failed === 0, `Deep verification reported failures: ${statusData.failed}`);

console.log(JSON.stringify({
  unauthenticated_status: unauthorized.status,
  manifest_total: statusData.catalog_total,
  verified: statusData.verified,
  pending: statusData.pending,
  failed: statusData.failed,
  idempotent_rerun: rerunData.results.every(item => item.skipped === true)
}, null, 2));
