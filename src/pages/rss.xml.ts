import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { u } from '../lib/url';

export async function GET(context: APIContext) {
  const posts = (await getCollection('blog', (p) => !p.data.draft && p.data.imported)).sort((a, b) => (b.data.pubDate?.getTime() ?? 0) - (a.data.pubDate?.getTime() ?? 0));
  return rss({
    title: 'NomadGao Journal',
    description: 'Guides and stories on remote work, coliving and life in India.',
    site: context.site!,
    items: posts.map((p) => ({ title: p.data.title, description: p.data.description, pubDate: p.data.pubDate, link: u(`/blog/${p.id}/`) })),
  });
}
