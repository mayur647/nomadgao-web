// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// SITE_URL and BASE_PATH are set by the GitHub Pages workflow.
// Locally they default to a root deployment.
const site = process.env.SITE_URL || 'https://example.github.io';
const base = process.env.BASE_PATH || '/';
const noindex = (process.env.PUBLIC_NOINDEX ?? 'true') !== 'false';

// Prefix root-relative links in Markdown with the deploy base path.
function rehypeBaseLinks() {
  const prefix = base.replace(/\/$/, '');
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'a') {
      const href = node.properties?.href;
      if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//') && prefix && !href.startsWith(prefix + '/')) {
        node.properties.href = prefix + href;
      }
    }
    if (node.type === 'element' && node.tagName === 'img') {
      const src = node.properties?.src;
      if (typeof src === 'string' && src.startsWith('/') && !src.startsWith('//') && prefix && !src.startsWith(prefix + '/')) node.properties.src = prefix + src;
      node.properties.loading = 'lazy';
      node.properties.decoding = 'async';
    }
    if (node.type === 'element' && node.tagName === 'a' && /^https?:/.test(node.properties?.href ?? '')) {
      node.properties.rel = 'noopener';
    }
    (node.children || []).forEach(walk);
  };
  return (tree) => walk(tree);
}

export default defineConfig({
  markdown: { rehypePlugins: [rehypeBaseLinks] },
  // Never inline scripts: the Content-Security-Policy only allows script files from this site.
  vite: { build: { assetsInlineLimit: 0 } },
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: noindex ? [] : [sitemap({ filter: (p) => !p.includes('/village/members/') })],
});
