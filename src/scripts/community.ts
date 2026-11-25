/**
 * Community data layer: accounts, member profiles, RSVPs and "say hi" notes.
 *
 * Two modes, same interface:
 *  - demo: no backend. Everything lives in this browser's localStorage, with a
 *    few sample members so the pages feel alive. Nothing leaves the device.
 *  - supabase: set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build
 *    time and run supabase/schema.sql. Row-level security does the guarding.
 */

export type Profile = {
  id: string;
  display_name: string;
  role: string;
  home_city: string;
  location: 'Anjuna' | 'Dharamkot' | '';
  stay_from: string | null;
  stay_to: string | null;
  show_dates: boolean;
  open_to: string;
  skills: string[];
  bio: string;
  visible: boolean;
};
export type User = { id: string; email: string };
export type Hello = { id: string; from_name: string; message: string; created_at: string };

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;
export const isDemo = !URL_ || !KEY;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ---------- safe localStorage ----------
const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ---------- demo seed ----------
const SAMPLE: Profile[] = [
  { id: 's1', display_name: 'Aditi', role: 'Product designer', home_city: 'Pune', location: 'Anjuna', stay_from: null, stay_to: null, show_dates: false, open_to: 'surf buddies, portfolio crits', skills: ['Figma', 'Branding'], bio: 'Freelance designer for early-stage startups. Here for a month to finish a rebrand.', visible: true },
  { id: 's2', display_name: 'Jonas', role: 'Backend engineer', home_city: 'Berlin', location: 'Dharamkot', stay_from: null, stay_to: null, show_dates: false, open_to: 'hikes, chess', skills: ['Go', 'Rust'], bio: 'Remote for a fintech. First time in India, staying for the mountains.', visible: true },
  { id: 's3', display_name: 'Meera', role: 'Founder', home_city: 'Bengaluru', location: 'Anjuna', stay_from: null, stay_to: null, show_dates: false, open_to: 'hiring chats', skills: ['Fundraising', 'Ops'], bio: 'Brought a six-person team for a planning week.', visible: true },
  { id: 's4', display_name: 'Rohan', role: 'Content creator', home_city: 'Mumbai', location: 'Anjuna', stay_from: null, stay_to: null, show_dates: false, open_to: 'collabs, sunset rides', skills: ['Video', 'Reels'], bio: 'Makes travel videos. In Goa for the season.', visible: true },
  { id: 's5', display_name: 'Sara', role: 'UX researcher', home_city: 'Lisbon', location: 'Dharamkot', stay_from: null, stay_to: null, show_dates: false, open_to: 'sunrise yoga, book swaps', skills: ['Research', 'Interviews'], bio: 'Slow-travelling through India for a season.', visible: true },
];
const SEED_COUNTS: Record<string, number> = {};

// ---------- supabase (lazy) ----------
let sbPromise: Promise<any> | null = null;
async function sb() {
  if (isDemo) throw new Error('demo');
  if (!sbPromise) sbPromise = import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_!, KEY!));
  return sbPromise;
}

// ---------- auth ----------
export async function currentUser(): Promise<User | null> {
  if (isDemo) return store.get<User | null>('ng_user', null);
  const c = await sb();
  const { data } = await c.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
}

export async function signIn(email: string): Promise<{ ok: boolean; message: string }> {
  email = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'That email does not look right.' };
  if (isDemo) {
    store.set('ng_user', { id: 'me', email });
    return { ok: true, message: 'Demo mode: you are signed in on this device only.' };
  }
  const c = await sb();
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${BASE}/village/me/`, shouldCreateUser: true } });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Check your inbox for a sign-in link.' };
}

export async function signOut() {
  if (isDemo) { store.del('ng_user'); return; }
  const c = await sb(); await c.auth.signOut();
}

// ---------- profiles ----------
export const emptyProfile = (id: string): Profile => ({ id, display_name: '', role: '', home_city: '', location: '', stay_from: null, stay_to: null, show_dates: true, open_to: '', skills: [], bio: '', visible: true });

export async function myProfile(): Promise<Profile | null> {
  const u = await currentUser(); if (!u) return null;
  if (isDemo) return store.get<Profile | null>('ng_profile', null);
  const c = await sb();
  const { data } = await c.from('profiles').select('*').eq('id', u.id).maybeSingle();
  return data;
}

export async function saveProfile(p: Profile): Promise<{ ok: boolean; message: string }> {
  const clean: Profile = {
    ...p,
    display_name: p.display_name.trim().slice(0, 40),
    role: p.role.trim().slice(0, 60),
    home_city: p.home_city.trim().slice(0, 40),
    open_to: p.open_to.trim().slice(0, 120),
    bio: p.bio.trim().slice(0, 400),
    skills: p.skills.map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 8),
  };
  if (!clean.display_name) return { ok: false, message: 'Add a name people can call you.' };
  if (isDemo) { store.set('ng_profile', clean); return { ok: true, message: 'Saved on this device.' }; }
  const c = await sb();
  const { error } = await c.from('profiles').upsert(clean);
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Profile saved.' };
}

export async function listProfiles(): Promise<Profile[]> {
  if (isDemo) {
    const mine = store.get<Profile | null>('ng_profile', null);
    return [...(mine && mine.visible ? [mine] : []), ...SAMPLE];
  }
  const c = await sb();
  const { data, error } = await c.from('profiles_public').select('*').eq('visible', true).order('updated_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data ?? [];
}

// ---------- RSVPs ----------
export async function myRsvps(): Promise<string[]> {
  const u = await currentUser(); if (!u) return [];
  if (isDemo) return store.get<string[]>('ng_rsvps', []);
  const c = await sb();
  const { data } = await c.from('rsvps').select('event_id').eq('user_id', u.id);
  return (data ?? []).map((r: { event_id: string }) => r.event_id);
}

export async function setRsvp(eventId: string, going: boolean): Promise<void> {
  const u = await currentUser(); if (!u) throw new Error('signin');
  if (isDemo) {
    const set = new Set(store.get<string[]>('ng_rsvps', []));
    going ? set.add(eventId) : set.delete(eventId);
    store.set('ng_rsvps', [...set]);
    return;
  }
  const c = await sb();
  if (going) await c.from('rsvps').upsert({ user_id: u.id, event_id: eventId });
  else await c.from('rsvps').delete().eq('user_id', u.id).eq('event_id', eventId);
}

export async function rsvpCounts(ids: string[]): Promise<Record<string, number>> {
  if (isDemo) {
    const mine = new Set(store.get<string[]>('ng_rsvps', []));
    return Object.fromEntries(ids.map((id) => [id, (SEED_COUNTS[id] ?? 0) + (mine.has(id) ? 1 : 0)]));
  }
  const c = await sb();
  const { data } = await c.rpc('rsvp_counts', { event_ids: ids });
  const out: Record<string, number> = Object.fromEntries(ids.map((i) => [i, 0]));
  (data ?? []).forEach((r: { event_id: string; going: number }) => (out[r.event_id] = r.going));
  return out;
}

// ---------- say hi ----------
export async function sayHi(toId: string, message: string): Promise<{ ok: boolean; message: string }> {
  const u = await currentUser(); if (!u) return { ok: false, message: 'Sign in first.' };
  const msg = message.trim().slice(0, 500);
  if (!msg) return { ok: false, message: 'Write a short note.' };
  if (isDemo) return { ok: true, message: 'Demo mode: in the live site this note lands in their inbox on the site.' };
  const c = await sb();
  const { error } = await c.from('hellos').insert({ to_id: toId, from_id: u.id, message: msg });
  return error ? { ok: false, message: error.message } : { ok: true, message: 'Sent. They will see it next time they log in.' };
}

export async function myHellos(): Promise<Hello[]> {
  if (isDemo) return [];
  const c = await sb();
  const { data } = await c.rpc('my_hellos');
  return data ?? [];
}

// ---------- tiny UI helpers ----------
export function toast(text: string) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const loginUrl = () => `${BASE}/village/me/?next=${encodeURIComponent(location.pathname)}`;
