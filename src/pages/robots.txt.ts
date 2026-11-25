import type { APIRoute } from 'astro';
import { u } from '../lib/url';
const noindex = (import.meta.env.PUBLIC_NOINDEX ?? 'true') !== 'false';
export const GET: APIRoute = ({ site }) => {
  const body = noindex
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nDisallow: ${u('/village/')}\n\nSitemap: ${new URL(u('/sitemap-index.xml'), site).href}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain' } });
};
