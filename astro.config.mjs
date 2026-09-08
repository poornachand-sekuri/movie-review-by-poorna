import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

const target = process.env.MRP_DEPLOY_TARGET ?? 'production';
if (!['production', 'preview'].includes(target)) throw new Error('Invalid MRP_DEPLOY_TARGET.');

export default defineConfig({
  adapter: cloudflare({
    imageService: 'compile',
    configPath: target === 'preview' ? './wrangler.preview.jsonc' : './wrangler.jsonc',
  }),
  output: 'server',
  session: false,
  trailingSlash: 'never',
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
