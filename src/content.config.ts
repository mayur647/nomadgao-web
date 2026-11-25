import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const topics = {
  'india-guides': 'India guides',
  goa: 'Goa',
  himachal: 'Himachal',
  'remote-work': 'Remote work',
  'digital-nomads': 'Digital nomad life',
  people: 'People',
  news: 'News',
} as const;
const topicKeys = Object.keys(topics) as [keyof typeof topics, ...(keyof typeof topics)[]];

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().max(60).optional(),
    description: z.string().min(70).max(170),
    topic: z.enum(topicKeys),
    tags: z.array(z.string()).default([]),
    author: z.string().default('NomadGao team'),
    pubDate: z.coerce.date().optional(),
    updatedDate: z.coerce.date().optional(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    takeaways: z.array(z.string()).optional(),
    faqs: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    relatedStay: z.enum(['goa-anjuna', 'dharamkot', 'lonavala']).optional(),
    // Migration bookkeeping
    legacyPath: z.string().optional(),
    imported: z.boolean().default(true),
    draft: z.boolean().default(false),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    location: z.enum(['Anjuna', 'Dharamkot', 'Lonavala']),
    kind: z.enum(['Weekly', 'Outdoors', 'Social', 'Workshop', 'Talk', 'Screening']),
    recurring: z.boolean().default(false),
    when: z.string(), // human label, e.g. "Wed · 6:00 pm"
    date: z.coerce.date(), // next occurrence, used for sorting and schema
    durationMins: z.number().default(120),
    capacity: z.number().optional(),
    publicEvent: z.boolean().default(true),
    host: z.string().default('NomadGao hosts'),
    blurb: z.string(),
  }),
});

const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(70).max(170),
    region: z.string(),
    order: z.number().default(0),
    updatedDate: z.coerce.date(),
    relatedStay: z.enum(['goa-anjuna', 'dharamkot', 'lonavala']).optional(),
  }),
});

export const collections = { blog, events, guides };
