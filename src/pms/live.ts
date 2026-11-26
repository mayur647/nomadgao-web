/** Live PMS: Supabase (Postgres functions in supabase/pms.sql) does all the rules. */
import type { PmsApi, Reservation, Grid, Status } from './types';
import { addDays, nightsBetween } from './dates';

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
let client: Promise<any> | null = null;
const sb = () => (client ??= import('@supabase/supabase-js').then(({ createClient }) => createClient(URL_, KEY)));
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await sb()).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
async function table<T>(q: (c: any) => any): Promise<T> {
  const { data, error } = await q(await sb());
  if (error) throw new Error(error.message);
  return data as T;
}

export const liveApi: PmsApi = {
  mode: 'live',
  async catalogue() {
    const [properties, roomTypes, ratePlans] = await Promise.all([
      table<any[]>((c) => c.from('properties').select('id,name,currency,tax_rate,check_in_time,check_out_time')),
      table<any[]>((c) => c.from('room_types').select('id,property_id,name,description,units,max_adults,sort').order('sort')),
      table<any[]>((c) => c.from('rate_plans').select('id,room_type_id,name,refundable,free_cancel_days,extra_adult_price')),
    ]);
    return { properties, roomTypes, ratePlans };
  },
  quote: (p, i, o, a) => rpc('quote', { p_property: p, p_check_in: i, p_check_out: o, p_adults: a }),
  async createHold(i) {
    const rows = await rpc<any[]>('create_hold', { p_property: i.property, p_rate_plan: i.ratePlan, p_check_in: i.checkIn, p_check_out: i.checkOut, p_adults: i.adults, p_name: i.name, p_email: i.email, p_phone: i.phone ?? '', p_country: i.country ?? '', p_notes: i.notes ?? '' });
    return rows[0];
  },
  async getBooking(code, email) { const rows = await rpc<any[]>('get_booking', { p_code: code, p_email: email }); return rows[0] ?? null; },
  async staffUser() { const { data } = await (await sb()).auth.getUser(); return data.user?.email ?? null; },
  async staffSignIn(email) {
    const { error } = await (await sb()).auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}${BASE}/pms/`, shouldCreateUser: true } });
    return error ? { ok: false, message: error.message } : { ok: true, message: 'Check your inbox for a sign-in link.' };
  },
  async staffSignOut() { await (await sb()).auth.signOut(); },
  async grid(property, from, days): Promise<Grid> {
    const to = addDays(from, days);
    const nights = nightsBetween(from, to);
    const rts = await table<any[]>((c) => c.from('room_types').select('*').eq('property_id', property).order('sort'));
    const plans = await table<any[]>((c) => c.from('rate_plans').select('*').in('room_type_id', rts.map((r) => r.id)));
    const rates = await table<any[]>((c) => c.from('rates').select('*').in('rate_plan_id', plans.map((p) => p.id)).gte('night', from).lt('night', to));
    const avail = await Promise.all(rts.map((rt) => rpc<any[]>('availability', { p_room_type: rt.id, p_from: from, p_to: to })));
    return {
      nights,
      roomTypes: rts.map((rt, i) => ({
        rt,
        days: avail[i].map((a) => ({ ...a, available: Math.max(0, a.units - a.sold - a.blocked) })),
        plans: plans.filter((p) => p.room_type_id === rt.id).map((plan) => ({
          plan,
          rates: nights.map((n) => { const r = rates.find((x) => x.rate_plan_id === plan.id && x.night === n); return { night: n, price: r ? Number(r.price) : null, min_stay: r?.min_stay ?? 1, stop_sell: r?.stop_sell ?? false }; }),
        })),
      })),
    };
  },
  async setRates(plan, from, to, patch) { await rpc('set_rates', { p_rate_plan: plan, p_from: from, p_to: to, p_price: patch.price ?? null, p_min_stay: patch.min_stay ?? null, p_stop_sell: patch.stop_sell ?? null }); },
  async addBlock(rt, from, to, units, reason) { await table((c) => c.from('blocks').insert({ room_type_id: rt, date_from: from, date_to: to, units, reason })); },
  async reservations(property, from, to) {
    const rows = await table<any[]>((c) => {
      let q = c.from('reservations').select('*, guest:guests(name,email,phone,country), rr:reservation_rooms(room_type_id,rate_plan_id,room_id)').lt('check_in', to).gt('check_out', from).order('check_in');
      if (property) q = q.eq('property_id', property);
      return q;
    });
    const now = Date.now();
    return rows.map((r) => ({ ...r, ...(r.rr?.[0] ?? {}), status: (r.status === 'hold' && r.hold_expires_at && Date.parse(r.hold_expires_at) <= now ? 'expired' : r.status) as Status,
      total: Number(r.total), paid: Number(r.paid), subtotal: Number(r.subtotal), tax: Number(r.tax) })) as Reservation[];
  },
  async rooms(property) {
    const rts = await table<any[]>((c) => c.from('room_types').select('id').eq('property_id', property));
    return table((c) => c.from('rooms').select('*').in('room_type_id', rts.map((r) => r.id)).order('id'));
  },
  async setStatus(id, status, roomId) { await rpc('set_reservation_status', { p_reservation: id, p_status: status, p_room: roomId ?? null }); },
  async staffConfirm(id, amount, method, source) { await rpc('staff_confirm', { p_reservation: id, p_amount: amount, p_method: method, p_source: source }); },
  async channelEvents() {
    const [out, log] = await Promise.all([
      table<any[]>((c) => c.from('channel_outbox').select('*').order('id', { ascending: false }).limit(50)),
      table<any[]>((c) => c.from('channel_log').select('*').order('id', { ascending: false }).limit(50)),
    ]);
    return [
      ...out.map((o) => ({ id: o.id, at: o.created_at, direction: 'out' as const, kind: o.kind, ok: !o.error, summary: `${o.kind} ${o.rate_plan_id ?? o.room_type_id} ${o.date_from} → ${o.date_to} · ${o.sent_at ? 'sent' : o.error ? 'error: ' + o.error : 'queued'}` })),
      ...log.map((l) => ({ id: 1e9 + l.id, at: l.created_at, direction: l.direction, kind: l.kind, ok: l.ok, summary: JSON.stringify(l.detail).slice(0, 160) })),
    ].sort((a, b) => b.at.localeCompare(a.at));
  },
};

export type { Reservation };
