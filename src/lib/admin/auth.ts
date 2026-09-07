import { env } from 'cloudflare:workers';

const SESSION_COOKIE = 'mrp_admin';
const SESSION_TTL_SECONDS = 60 * 60 * 12;

interface AdminBindings {
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
}

function bindings(): AdminBindings {
  return env as unknown as AdminBindings;
}

function sessionSecret(config = bindings()): string {
  const dedicated = config.ADMIN_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;

  const password = config.ADMIN_PASSWORD?.trim();
  return password ? `movie-review-by-poorna:admin-session:v1:${password}` : '';
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function isSameOriginWrite(request: Request): boolean {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get('origin');
  return !origin || origin === requestUrl.origin;
}

async function secureEqual(a: string, b: string): Promise<boolean> {
  const aa = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;

  let diff = 0;
  for (let index = 0; index < aa.length; index += 1) {
    diff |= (aa[index] ?? 0) ^ (bb[index] ?? 0);
  }
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signSession(expiry: number, nonce: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`admin:${expiry}:${nonce}`),
  );
  return base64Url(new Uint8Array(signature));
}

export async function isAdminAuthenticated(request: Request): Promise<boolean> {
  const secret = sessionSecret();
  if (!secret) return false;

  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return false;

  const [expiryText, nonce, signature] = token.split('.');
  const expiry = Number(expiryText);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000) || !nonce || !signature) {
    return false;
  }

  const expected = await signSession(expiry, nonce, secret);
  return secureEqual(signature, expected);
}

export async function loginAdmin(request: Request): Promise<Response> {
  const config = bindings();
  const password = config.ADMIN_PASSWORD?.trim();
  const secret = sessionSecret(config);

  if (!password || !secret) {
    return Response.json(
      { error: 'Admin security is not configured. Add ADMIN_PASSWORD as a Worker secret.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  const supplied = typeof body?.password === 'string' ? body.password : '';
  if (!(await secureEqual(supplied, password))) {
    return Response.json(
      { error: 'Incorrect password.' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }

  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const signature = await signSession(expiry, nonce, secret);
  const cookie = `${SESSION_COOKIE}=${expiry}.${nonce}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;

  return Response.json(
    { authenticated: true },
    {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'set-cookie': cookie,
      },
    },
  );
}

export function logoutAdmin(): Response {
  return Response.json(
    { authenticated: false },
    {
      headers: {
        'cache-control': 'no-store',
        'set-cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      },
    },
  );
}
