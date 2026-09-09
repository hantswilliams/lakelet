// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

const base = process.env.SITE_BASE || '/';

// Markdown pages (the docs) link with root-relative paths such as /docs/cli; on GitHub
// Pages the site lives under /lakelet/, so prefix them the way src/lib/url.ts does for
// .astro pages. Hand-rolled walk rather than a dependency: the tree is small.
function rehypeBasePath() {
  const prefix = base.replace(/\/$/, '');
  const walk = node => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href;
      if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) node.properties.href = prefix + href;
    }
    node.children?.forEach(walk);
  };
  return tree => { if (prefix) walk(tree); };
}

// https://astro.build/config
export default defineConfig({
  // SITE_URL / SITE_BASE are set by the GitHub Pages workflow; defaults are for a custom domain at the root.
  site: process.env.SITE_URL || 'https://lakelet.dev',
  base,
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },          // /pricing -> dist/pricing.html (clean URLs on any static host)
  integrations: [sitemap()],
  markdown: { rehypePlugins: [rehypeBasePath], shikiConfig: { theme: 'github-dark' } },
});
