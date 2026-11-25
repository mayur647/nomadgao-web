// Prefix internal paths with the deploy base (e.g. /nomadgao-web on GitHub Pages).
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function u(path: string): string {
  if (/^(https?:|mailto:|tel:|#)/.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
