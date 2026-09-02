import cloudflare from '@astrojs/cloudflare';
import { defineConfig } from 'astro/config';

export default defineConfig({
  adapter: cloudflare(),
  output: 'server',
  trailingSlash: 'never',
  vite: {
    build: {
      sourcemap: false,
    },
  },
});
