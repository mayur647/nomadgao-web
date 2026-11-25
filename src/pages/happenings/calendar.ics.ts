import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { vevent, wrap } from '../../lib/ics';
import { u } from '../../lib/url';

export const GET: APIRoute = async ({ site }) => {
  const events = await getCollection('events');
  const body = events.map((e) => vevent(e, new URL(u(`/happenings/${e.id}/`), site).href)).join('\r\n');
  return new Response(wrap(body), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
};
