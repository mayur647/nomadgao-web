// Writes vercel.json and public/_redirects (Netlify / Cloudflare Pages) from
// src/data/redirects.json, so the production host sends real 301s.
import { readFileSync, writeFileSync } from 'node:fs';
const r = JSON.parse(readFileSync(new URL('../src/data/redirects.json', import.meta.url)));
const extra = [
  { from: '/blog/category/:slug*', to: '/blog/' },
  { from: '/blog/tag/:slug*', to: '/blog/' },
  { from: '/events/:slug*', to: '/happenings/' },
  { from: '/web-stories/:slug*', to: '/blog/' },
];
const all = [...r, ...extra];
writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify({
  trailingSlash: true,
  redirects: all.map((x) => ({ source: x.from, destination: x.to, permanent: true })),
  headers: [{ source: '/(.*)', headers: [
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ] }],
}, null, 2) + '\n');
writeFileSync(new URL('../public/_redirects', import.meta.url), all.map((x) => `${x.from.replace(':slug*', '*')} ${x.to} 301`).join('\n') + '\n');
console.log(`wrote ${all.length} redirects`);
