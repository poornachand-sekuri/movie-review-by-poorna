import type { APIRoute } from 'astro';
import projectorRoomHtml from '../../admin/projector-room.html?raw';
import { isAdminAuthenticated } from '../../lib/admin/auth';

export const prerender = false;

function securityHeaders(): HeadersInit {
  return {
    'cache-control': 'no-store, private, max-age=0',
    'content-type': 'text/html; charset=utf-8',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function loginDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#080604">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>The Projector Room | Movie Reviews By Poorna</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Oswald:wght@400;500;600;700&family=Source+Serif+4:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/admin/admin.css?v=20260907-projector-room-1">
</head>
<body>
  <section class="login-shell">
    <div class="login-card">
      <div class="brand-mark">★</div>
      <div class="login-brand">MOVIE REVIEWS</div>
      <div class="login-sub">★ BY POORNA ★ · ADMIN CONSOLE</div>
      <h1>The Projector Room</h1>
      <p>Sign in to moderate audience comments, inspect traffic, and manage published movie reviews.</p>
      <form id="loginForm">
        <label class="field"><span>Admin Password</span><input id="loginPassword" type="password" autocomplete="current-password" required></label>
        <button class="primary big" type="submit">ENTER PROJECTOR ROOM →</button>
        <div id="loginError" class="form-error" aria-live="polite"></div>
      </form>
    </div>
  </section>
  <script>
    (() => {
      const form = document.getElementById('loginForm');
      const password = document.getElementById('loginPassword');
      const error = document.getElementById('loginError');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';
        const submit = form.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
          const response = await fetch('/api/admin/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: password.value }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.error || 'Unable to sign in.');
          password.value = '';
          location.replace('/admin/');
        } catch (failure) {
          error.textContent = failure instanceof Error ? failure.message : 'Unable to sign in.';
          password.focus();
          password.select();
        } finally {
          submit.disabled = false;
        }
      });
      password.focus();
    })();
  </script>
</body>
</html>`;
}

function authenticatedDocument(): string {
  const logoutGuard = `<script>
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('#logoutBtn') : null;
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }).finally(() => location.replace('/admin/'));
    }, true);
  </script>`;
  return projectorRoomHtml.replace('</body>', `${logoutGuard}\n</body>`);
}

export const GET: APIRoute = async ({ request }) => {
  const authenticated = await isAdminAuthenticated(request);
  return new Response(authenticated ? authenticatedDocument() : loginDocument(), {
    status: 200,
    headers: securityHeaders(),
  });
};
