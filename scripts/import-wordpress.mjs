#!/usr/bin/env node
/**
 * Import WordPress posts into src/content/blog/*.md.
 *
 * Usage
 *   npm run import:wp -- path/to/export.xml          (WordPress: Tools → Export → All content)
 *   npm run import:wp -- --rest https://nomadgao.com (public REST API, no Yoast fields)
 *   add --dry-run to see what would change, --no-images to skip downloading images
 *
 * What it does, per post
 *   - matches the post to its stub by the old URL path (legacyPath)
 *   - keeps the words; converts HTML to Markdown, removes page-builder shortcodes
 *   - demotes stray H1s to H2 (the page title is the only H1)
 *   - downloads images to public/images/blog/<slug>/ with descriptive names,
 *     keeps or creates alt text
 *   - rewrites internal links to the new URLs using src/data/redirects.json
 *   - keeps author and dates; uses the Yoast title/description when present and sane
 *   - marks the post imported: true
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG = join(ROOT, 'src/content/blog');
const IMG = join(ROOT, 'public/images/blog');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const noImages = args.includes('--no-images');
const restIdx = args.indexOf('--rest');
const source = restIdx >= 0 ? args[restIdx + 1] : args.find((a) => !a.startsWith('--'));
if (!source) { console.error('Give a WordPress export file or --rest <site url>.'); process.exit(1); }

const redirects = JSON.parse(readFileSync(join(ROOT, 'src/data/redirects.json'), 'utf8'));
const redirectMap = new Map(redirects.map((r) => [r.from, r.to]));
const OLD_HOSTS = /^https?:\/\/(www\.)?nomadgao\.com/i;

// ---------- stubs ----------
const stubs = new Map(); // legacyPath -> { file, frontmatter text, body }
for (const f of readdirSync(BLOG).filter((x) => x.endsWith('.md'))) {
  const raw = readFileSync(join(BLOG, f), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const legacy = m?.[1].match(/^legacyPath:\s*(.+)$/m)?.[1].trim();
  if (legacy) stubs.set(legacy, { file: f, slug: f.replace(/\.md$/, ''), fm: m[1], body: m[2] });
}

// ---------- fetch posts ----------
async function loadPosts() {
  if (restIdx >= 0) {
    const out = []; let page = 1;
    while (true) {
      const res = await fetch(`${source.replace(/\/$/, '')}/wp-json/wp/v2/posts?per_page=100&page=${page}&_embed=1`);
      if (!res.ok) break;
      const list = await res.json(); if (!list.length) break;
      for (const p of list) out.push({
        link: p.link, title: strip(p.title.rendered), html: p.content.rendered, date: p.date, modified: p.modified,
        author: p._embedded?.author?.[0]?.name, cover: p._embedded?.['wp:featuredmedia']?.[0]?.source_url,
        coverAlt: p._embedded?.['wp:featuredmedia']?.[0]?.alt_text, yoastTitle: p.yoast_head_json?.title, yoastDesc: p.yoast_head_json?.description,
      });
      if (list.length < 100) break; page++;
    }
    return out;
  }
  const xml = readFileSync(source, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false, cdataPropName: false, isArray: (n) => ['item', 'wp:postmeta', 'category'].includes(n) });
  const items = parser.parse(xml).rss.channel.item ?? [];
  const attachments = new Map(items.filter((i) => i['wp:post_type'] === 'attachment').map((i) => [String(i['wp:post_id']), { url: i['wp:attachment_url'], alt: meta(i, '_wp_attachment_image_alt') }]));
  return items.filter((i) => i['wp:post_type'] === 'post' && i['wp:status'] === 'publish').map((i) => {
    const thumb = attachments.get(String(meta(i, '_thumbnail_id') ?? ''));
    return {
      link: i.link, title: String(i.title ?? ''), html: String(i['content:encoded'] ?? ''), date: i['wp:post_date'], modified: i['wp:post_modified'],
      author: i['dc:creator'], cover: thumb?.url, coverAlt: thumb?.alt, yoastTitle: meta(i, '_yoast_wpseo_title'), yoastDesc: meta(i, '_yoast_wpseo_metadesc'),
    };
  });
}
function meta(item, key) { return (item['wp:postmeta'] ?? []).find((m) => m['wp:meta_key'] === key)?.['wp:meta_value']; }
function strip(s) { return String(s).replace(/<[^>]+>/g, '').replace(/&#8217;/g, '’').replace(/&amp;/g, '&').trim(); }

// ---------- conversion ----------
const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
td.remove(['script', 'style', 'iframe', 'noscript', 'form']);
td.addRule('youtube', {
  filter: (n) => n.nodeName === 'IFRAME' && /youtube/.test(n.getAttribute('src') || ''),
  replacement: (_c, n) => `\n\n[Watch the video](${n.getAttribute('src')})\n\n`,
});

function cleanHtml(html) {
  return html
    .replace(/\[\/?(vc_|et_pb_|fusion_|elementor|caption|gallery)[^\]]*\]/g, '') // page-builder shortcodes
    .replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>')
    .replace(/<p>\s*(&nbsp;)?\s*<\/p>/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '');
}

function rewriteLinks(md) {
  return md.replace(/\]\((https?:\/\/(?:www\.)?nomadgao\.com)?(\/[^)\s]*)\)/g, (all, host, path) => {
    if (!host && !path.startsWith('/')) return all;
    const clean = path.split(/[?#]/)[0].replace(/\/?$/, '/');
    const hash = path.includes('#') ? path.slice(path.indexOf('#')) : '';
    const to = redirectMap.get(clean) ?? (host ? clean : null);
    return to ? `](${to}${hash})` : all;
  });
}

async function localiseImages(md, slug, title) {
  if (noImages) return md;
  let n = 0;
  const dir = join(IMG, slug);
  const jobs = [];
  const out = md.replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_all, alt, url) => {
    n++;
    const ext = (extname(new URL(url).pathname) || '.jpg').toLowerCase().replace('.jpeg', '.jpg');
    const name = `${slug}-${n}${ext}`;
    jobs.push({ url, file: join(dir, name) });
    const altText = alt.trim() || `${title}, image ${n}`; // TODO: review generated alt text
    return `![${altText.replace(/[[\]]/g, '')}](/images/blog/${slug}/${name})`;
  });
  if (!dry && jobs.length) {
    mkdirSync(dir, { recursive: true });
    for (const j of jobs) {
      if (existsSync(j.file)) continue;
      try { const r = await fetch(j.url); if (r.ok) writeFileSync(j.file, Buffer.from(await r.arrayBuffer())); else console.warn('  image failed', r.status, j.url); }
      catch (e) { console.warn('  image failed', j.url, e.message); }
    }
  }
  return out;
}

const yaml = (v) => JSON.stringify(v);
function setField(fm, key, value) {
  const line = `${key}: ${value}`;
  return new RegExp(`^${key}:.*$`, 'm').test(fm) ? fm.replace(new RegExp(`^${key}:.*$`, 'm'), line) : `${fm}\n${line}`;
}

// ---------- run ----------
const posts = await loadPosts();
let done = 0; const unmatched = [];
for (const p of posts) {
  const path = new URL(p.link, 'https://nomadgao.com').pathname.replace(/\/?$/, '/');
  const stub = stubs.get(path);
  if (!stub) { unmatched.push(path); continue; }
  let md = td.turndown(cleanHtml(p.html));
  md = rewriteLinks(md);
  md = await localiseImages(md, stub.slug, p.title);
  md = md.replace(/\n{3,}/g, '\n\n').trim() + '\n';

  let fm = stub.fm;
  fm = setField(fm, 'title', yaml(strip(p.title)));
  if (p.yoastDesc && p.yoastDesc.length >= 70 && p.yoastDesc.length <= 170 && !p.yoastDesc.includes('%%')) fm = setField(fm, 'description', yaml(p.yoastDesc));
  if (p.yoastTitle && !p.yoastTitle.includes('%%') && p.yoastTitle.length <= 60) fm = setField(fm, 'seoTitle', yaml(p.yoastTitle.replace(/\s*[-|–]\s*NomadGao\s*$/i, '')));
  if (p.author) fm = setField(fm, 'author', yaml(String(p.author)));
  if (p.date) fm = setField(fm, 'pubDate', String(p.date).slice(0, 10));
  if (p.modified && String(p.modified).slice(0, 10) !== String(p.date).slice(0, 10)) fm = setField(fm, 'updatedDate', String(p.modified).slice(0, 10));
  if (p.cover && !noImages) {
    const ext = (extname(new URL(p.cover).pathname) || '.jpg').toLowerCase();
    const file = `cover${ext}`;
    if (!dry) { mkdirSync(join(IMG, stub.slug), { recursive: true }); try { const r = await fetch(p.cover); if (r.ok) writeFileSync(join(IMG, stub.slug, file), Buffer.from(await r.arrayBuffer())); } catch {} }
    fm = setField(fm, 'cover', yaml(`/images/blog/${stub.slug}/${file}`));
    fm = setField(fm, 'coverAlt', yaml(p.coverAlt || strip(p.title)));
  }
  fm = setField(fm, 'imported', 'true');
  if (!dry) writeFileSync(join(BLOG, stub.file), `---\n${fm}\n---\n\n${md}`);
  done++;
  console.log(`${dry ? '[dry] ' : ''}✓ ${path} → /blog/${stub.slug}/ (${md.split(/\s+/).length} words)`);
}
console.log(`\n${done} imported, ${unmatched.length} not matched to a stub.`);
if (unmatched.length) console.log('Not matched (add a stub or a redirect):\n  ' + unmatched.join('\n  '));
