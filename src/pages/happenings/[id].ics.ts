import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { vevent, wrap } from '../../lib/ics';
import { u } from '../../lib/url';

export async function getStaticPaths() {
  return (await getCollection('events')).map((e) => ({ params: { id: e.id }, props: { e } }));
}
export const GET: APIRoute = ({ props, site }) =>
  new Response(wrap(vevent(props.e, new URL(u(`/happenings/${props.e.id}/`), site).href)), { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
