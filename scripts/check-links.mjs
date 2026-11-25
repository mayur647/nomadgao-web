// Checks every internal link, image and script in dist/ resolves to a file.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const DIST = new URL('../dist/', import.meta.url).pathname;
const base = (process.env.BASE_PATH || '/').replace(/\/$/, '');
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : f.endsWith('.html') && files.push(p); } })(DIST);
const bad = new Map();
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  for (const [, attr, url] of html.matchAll(/\s(href|src|action)="([^"#?]*)/g)) {
    if (!url.startsWith('/') || url.startsWith('//')) continue;
    if (base && !url.startsWith(base + '/') && url !== base) { bad.set(`${url} (missing base)`, f); continue; }
    const rel = decodeURI(url.slice(base.length)).replace(/^\//, '');
    const target = join(DIST, rel);
    const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
    if (!ok) bad.set(url, f.replace(DIST, ''));
  }
}
console.log(`${files.length} pages checked, ${bad.size} broken internal links`);
for (const [u, f] of bad) console.log(`  ${u}  ← ${f}`);
process.exit(bad.size ? 1 : 0);
