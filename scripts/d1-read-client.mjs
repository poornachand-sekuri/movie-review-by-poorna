import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Deployment checks use existing GitHub Cloudflare secrets, never browser/admin credentials.
export function remoteD1(target = 'production') {
  assert(['production', 'preview'].includes(target));
  const config = JSON.parse(readFileSync(target === 'preview' ? 'wrangler.preview.jsonc' : 'wrangler.jsonc', 'utf8'));
  const binding = config.d1_databases.find(db => db.binding === 'CONTENT_DB');
  assert.equal(binding?.database_name, 'movie-review-by-poorna-content');
  assert.equal(binding.database_id, '6c88b16c-c302-47cf-92cd-bdc5f8470bc2');
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  assert(account && /^[a-f0-9]{32}$/i.test(account) && token, 'Cloudflare deployment credentials are required.');
  return {
    config, binding,
    async query(sql, params = []) {
      assert(/^\s*(SELECT|WITH)\b/i.test(sql), 'Deployment probes are read-only.');
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${binding.database_id}/query`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000),
      });
      const data = await response.json();
      assert(response.ok && data.success, `D1 read failed: ${data.errors?.map(e => e.message).join('; ') || response.status}`);
      assert.equal(data.result?.length, 1, 'Expected one query result.');
      assert.equal(data.result[0].success, true);
      return data.result[0];
    },
  };
}
