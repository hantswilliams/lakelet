// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // SITE_URL / SITE_BASE are set by the GitHub Pages workflow; defaults are for a custom domain at the root.
  site: process.env.SITE_URL || 'https://lakelet.dev',
  base: process.env.SITE_BASE || '/',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },          // /pricing -> dist/pricing.html (clean URLs on any static host)
  integrations: [sitemap()],
});
