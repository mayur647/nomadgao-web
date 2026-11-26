/**
 * Demo PMS: the same rules as supabase/pms.sql, kept in this browser's
 * localStorage so the booking engine and admin work on GitHub Pages with no
 * server. Nothing here is shared between devices and no money moves.
 */
import type { PmsApi, Property, RoomType, RatePlan, Room, Rate, Block, Reservation, QuoteRow, HoldInput, Status, ChannelEvent, Grid } from './types';
import { todayIST, addDays, diffDays, nightsBetween, isoWeekday } from './dates';

type DB = {
  v: 2;
  properties: Property[]; roomTypes: RoomType[]; ratePlans: RatePlan[]; rooms: Room[];
  rates: Record<string, Rate>; // key `${plan}|${night}`
  blocks: Block[]; reservations: Reservation[]; events: ChannelEvent[]; seq: number; seededFrom: string;
};
const KEY = 'ng_pms_demo';
const HOLD_MINUTES = 15;

function seed(): DB {
  const start = todayIST();
  const properties: Property[] = [
    { id: 'vila-nova', name: 'NomadGao Vila Nova, Anjuna', currency: 'INR', tax_rate: 0.12, check_in_time: '13:00', check_out_time: '11:00' },
    { id: 'dharamkot', name: 'NomadGao Dharamkot', currency: 'INR', tax_rate: 0.12, check_in_time: '13:00', check_out_time: '11:00' },
  ];
  const roomTypes: RoomType[] = [
    { id: 'vn-private', property_id: 'vila-nova', name: 'Private room', description: 'Double bed, private bathroom, coworking access.', units: 8, max_adults: 2, sort: 1 },
    { id: 'vn-balcony', property_id: 'vila-nova', name: 'Private room with balcony', description: 'Double bed, balcony, private bathroom, coworking access.', units: 4, max_adults: 2, sort: 2 },
    { id: 'dk-mountain', property_id: 'dharamkot', name: 'Mountain-view room', description: 'Double bed, mountain view, private bathroom, coworking access.', units: 6, max_adults: 2, sort: 1 },
    { id: 'dk-standard', property_id: 'dharamkot', name: 'Standard room', description: 'Double bed, private bathroom, coworking access.', units: 6, max_adults: 2, sort: 2 },
  ];
  const ratePlans: RatePlan[] = [
    { id: 'vn-private-flex', room_type_id: 'vn-private', name: 'Flexible', refundable: true, free_cancel_days: 7, extra_adult_price: 0 },
    { id: 'vn-private-nr', room_type_id: 'vn-private', name: 'Non-refundable', refundable: false, free_cancel_days: 0, extra_adult_price: 0 },
    { id: 'vn-balcony-flex', room_type_id: 'vn-balcony', name: 'Flexible', refundable: true, free_cancel_days: 7, extra_adult_price: 0 },
    { id: 'dk-mountain-flex', room_type_id: 'dk-mountain', name: 'Flexible', refundable: true, free_cancel_days: 7, extra_adult_price: 0 },
    { id: 'dk-standard-flex', room_type_id: 'dk-standard', name: 'Flexible', refundable: true, free_cancel_days: 7, extra_adult_price: 0 },
  ];
  const base: Record<string, number> = { 'vn-private-flex': 2200, 'vn-private-nr': 1980, 'vn-balcony-flex': 2800, 'dk-mountain-flex': 2400, 'dk-standard-flex': 1900 };
  const rates: Record<string, Rate> = {};
  for (const p of ratePlans) for (const n of nightsBetween(start, addDays(start, 365))) {
    rates[`${p.id}|${n}`] = { rate_plan_id: p.id, night: n, price: base[p.id] + ([5, 6].includes(isoWeekday(n)) ? 300 : 0), min_stay: 1, stop_sell: false, closed_to_arrival: false, closed_to_departure: false };
  }
  const rooms: Room[] = [];
  for (let g = 1; g <= 12; g++) rooms.push({ id: `vn-${100 + g}`, room_type_id: g <= 8 ? 'vn-private' : 'vn-balcony', name: `Room ${100 + g}`, housekeeping: 'clean' });
  for (let g = 1; g <= 12; g++) rooms.push({ id: `dk-${200 + g}`, room_type_id: g <= 6 ? 'dk-mountain' : 'dk-standard', name: `Room ${200 + g}`, housekeeping: 'clean' });
  const db: DB = { v: 2, properties, roomTypes, ratePlans, rooms, rates, blocks: [], reservations: [], events: [], seq: 1, seededFrom: start };
  // A few sample bookings so the admin has something to show.
  const sample = (prop: string, rt: string, plan: string, inOff: number, n: number, name: string, source: string, status: Status) => {
    const ci = addDays(start, inOff), co = addDays(ci, n);
    const nightly = nightsBetween(ci, co).map((x) => db.rates[`${plan}|${x}`]?.price ?? 0);
    const sub = nightly.reduce((a, b) => a + b, 0);
    db.reservations.push({ id: uid(), code: code(), property_id: prop, status, source, ota_reservation_id: source === 'direct' ? null : 'OTA-' + Math.floor(Math.random() * 1e6),
      check_in: ci, check_out: co, adults: 2, subtotal: sub, tax: round(sub * 0.12), total: round(sub * 1.12), paid: source === 'direct' ? round(sub * 1.12) : 0, currency: 'INR',
      hold_expires_at: null, overbooked: false, notes: '', created_at: new Date().toISOString(),
      guest: { name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, phone: null, country: 'IN' }, room_type_id: rt, rate_plan_id: plan, room_id: status === 'checked_in' ? (rt === 'vn-private' ? 'vn-101' : 'dk-201') : null });
  };
  sample('vila-nova', 'vn-private', 'vn-private-flex', -2, 7, 'Aditi Rao (sample)', 'direct', 'checked_in');
  sample('vila-nova', 'vn-private', 'vn-private-flex', 0, 5, 'Jonas Weber (sample)', 'booking_com', 'confirmed');
  sample('vila-nova', 'vn-balcony', 'vn-balcony-flex', 3, 14, 'Meera Iyer (sample)', 'direct', 'confirmed');
  sample('dharamkot', 'dk-mountain', 'dk-mountain-flex', -3, 3, 'Sara Costa (sample)', 'airbnb', 'checked_in');
  sample('dharamkot', 'dk-standard', 'dk-standard-flex', 1, 30, 'Kabir Shah (sample)', 'direct', 'confirmed');
  return db;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const code = () => 'NG-' + Math.random().toString(16).slice(2, 8).toUpperCase();
const round = (n: number) => Math.round(n * 100) / 100;

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const db = JSON.parse(raw) as DB; if (db.v === 2) return db; }
  } catch { /* fall through */ }
  const db = seed(); save(db); return db;
}
function save(db: DB) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* quota or private mode */ } }

function isLive(r: Reservation, now = Date.now()) {
  return r.status === 'confirmed' || r.status === 'checked_in' || (r.status === 'hold' && !!r.hold_expires_at && Date.parse(r.hold_expires_at) > now);
}
function dayStats(db: DB, rtId: string, night: string) {
  const rt = db.roomTypes.find((x) => x.id === rtId)!;
  const sold = db.reservations.filter((r) => r.room_type_id === rtId && isLive(r) && r.check_in <= night && night < r.check_out).length;
  const blocked = db.blocks.filter((b) => b.room_type_id === rtId && b.date_from <= night && night < b.date_to).reduce((a, b) => a + b.units, 0);
  return { night, units: rt.units, sold, blocked, available: Math.max(0, rt.units - sold - blocked) };
}
function logEvent(db: DB, direction: 'out' | 'in', kind: string, summary: string, ok = true) {
  db.events.unshift({ id: db.seq++, at: new Date().toISOString(), direction, kind, ok, summary });
  db.events = db.events.slice(0, 200);
}
function queueAvailability(db: DB, rtId: string, from: string, to: string) {
  logEvent(db, 'out', 'availability', `Channel manager: availability for ${rtId}, ${from} → ${to} (demo: not sent)`);
}

function quoteDb(db: DB, property: string, checkIn: string, checkOut: string, adults: number): QuoteRow[] {
  const n = diffDays(checkIn, checkOut);
  if (checkIn < todayIST()) throw new Error('Check-in is in the past');
  if (n < 1 || n > 120) throw new Error('Stay must be between 1 and 120 nights');
  if (adults < 1 || adults > 20) throw new Error('Adults must be between 1 and 20');
  const prop = db.properties.find((p) => p.id === property);
  if (!prop) throw new Error('Unknown property');
  const nights = nightsBetween(checkIn, checkOut);
  const rows: QuoteRow[] = [];
  for (const rt of db.roomTypes.filter((r) => r.property_id === property).sort((a, b) => a.sort - b.sort)) {
    const left = Math.min(...nights.map((x) => dayStats(db, rt.id, x).available));
    for (const plan of db.ratePlans.filter((p) => p.room_type_id === rt.id)) {
      const rates = nights.map((x) => db.rates[`${plan.id}|${x}`]);
      const extra = Math.max(0, adults - 2) * plan.extra_adult_price;
      const nightly = rates.filter(Boolean).map((r) => ({ night: r.night, price: r.price + extra }));
      const subtotal = round(nightly.reduce((a, b) => a + b.price, 0));
      const first = db.rates[`${plan.id}|${checkIn}`];
      const dep = db.rates[`${plan.id}|${checkOut}`];
      const reason =
        adults > rt.max_adults ? 'Too many guests for this room'
        : nightly.length < n ? 'Not open for these dates yet'
        : rates.some((r) => r?.stop_sell) ? 'Not available on some nights'
        : first?.closed_to_arrival ? 'Arrivals are closed on this date'
        : dep?.closed_to_departure ? 'Departures are closed on this date'
        : n < (first?.min_stay ?? 1) ? `Minimum stay is ${first.min_stay} nights`
        : left < 1 ? 'Sold out' : null;
      rows.push({ room_type_id: rt.id, room_type_name: rt.name, description: rt.description, max_adults: rt.max_adults, rate_plan_id: plan.id, rate_plan_name: plan.name,
        refundable: plan.refundable, free_cancel_days: plan.free_cancel_days, available: left, nights: n, nightly, subtotal, tax: round(subtotal * prop.tax_rate), total: round(subtotal * (1 + prop.tax_rate)), currency: prop.currency, reason });
    }
  }
  return rows;
}

let staff: string | null = null;
try { staff = sessionStorage.getItem('ng_pms_staff'); } catch { /* ignore */ }

export const demoApi: PmsApi = {
  mode: 'demo',
  async catalogue() { const db = load(); return { properties: db.properties, roomTypes: db.roomTypes, ratePlans: db.ratePlans }; },
  async quote(property, checkIn, checkOut, adults) { return quoteDb(load(), property, checkIn, checkOut, adults); },
  async createHold(i: HoldInput) {
    const db = load();
    if (!i.name.trim()) throw new Error('Name is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)) throw new Error('A valid email is required');
    const q = quoteDb(db, i.property, i.checkIn, i.checkOut, i.adults).find((x) => x.rate_plan_id === i.ratePlan);
    if (!q) throw new Error('Unknown rate');
    if (q.reason) throw new Error(q.reason);
    const r: Reservation = { id: uid(), code: code(), property_id: i.property, status: 'hold', source: 'direct', ota_reservation_id: null, check_in: i.checkIn, check_out: i.checkOut,
      adults: i.adults, subtotal: q.subtotal, tax: q.tax, total: q.total, paid: 0, currency: q.currency, hold_expires_at: new Date(Date.now() + HOLD_MINUTES * 60000).toISOString(),
      overbooked: false, notes: (i.notes ?? '').slice(0, 500), created_at: new Date().toISOString(),
      guest: { name: i.name.trim(), email: i.email.trim().toLowerCase(), phone: i.phone?.trim() || null, country: i.country?.trim() || null }, room_type_id: q.room_type_id, rate_plan_id: q.rate_plan_id, room_id: null };
    db.reservations.push(r);
    queueAvailability(db, r.room_type_id, r.check_in, r.check_out);
    save(db);
    return { reservation_id: r.id, code: r.code, total: r.total, hold_expires_at: r.hold_expires_at! };
  },
  async getBooking(c, email) {
    const db = load();
    const r = db.reservations.find((x) => x.code === c.trim().toUpperCase() && x.guest.email === email.trim().toLowerCase());
    if (!r) return null;
    const rt = db.roomTypes.find((x) => x.id === r.room_type_id);
    const p = db.properties.find((x) => x.id === r.property_id);
    const status = r.status === 'hold' && r.hold_expires_at && Date.parse(r.hold_expires_at) <= Date.now() ? 'expired' : r.status;
    return { code: r.code, status, property: p?.name ?? '', room: rt?.name ?? '', check_in: r.check_in, check_out: r.check_out, adults: r.adults, total: r.total, paid: r.paid, currency: r.currency };
  },
  async staffUser() { return staff; },
  async staffSignIn(email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'Enter an email.' };
    staff = email.trim().toLowerCase(); try { sessionStorage.setItem('ng_pms_staff', staff); } catch { /* ignore */ }
    return { ok: true, message: 'Demo mode: signed in on this device only.' };
  },
  async staffSignOut() { staff = null; try { sessionStorage.removeItem('ng_pms_staff'); } catch { /* ignore */ } },
  async grid(property, from, days): Promise<Grid> {
    const db = load();
    const nights = nightsBetween(from, addDays(from, days));
    return {
      nights,
      roomTypes: db.roomTypes.filter((r) => r.property_id === property).sort((a, b) => a.sort - b.sort).map((rt) => ({
        rt,
        days: nights.map((x) => dayStats(db, rt.id, x)),
        plans: db.ratePlans.filter((p) => p.room_type_id === rt.id).map((plan) => ({
          plan, rates: nights.map((x) => { const r = db.rates[`${plan.id}|${x}`]; return { night: x, price: r?.price ?? null, min_stay: r?.min_stay ?? 1, stop_sell: r?.stop_sell ?? false }; }),
        })),
      })),
    };
  },
  async setRates(planId, from, to, patch) {
    const db = load();
    if (to <= from || diffDays(from, to) > 500) throw new Error('Bad date range');
    for (const n of nightsBetween(from, to)) {
      const k = `${planId}|${n}`;
      const cur = db.rates[k] ?? { rate_plan_id: planId, night: n, price: patch.price ?? 0, min_stay: 1, stop_sell: false, closed_to_arrival: false, closed_to_departure: false };
      db.rates[k] = { ...cur, ...(patch.price != null && { price: patch.price }), ...(patch.min_stay != null && { min_stay: patch.min_stay }), ...(patch.stop_sell != null && { stop_sell: patch.stop_sell }) };
    }
    logEvent(db, 'out', 'rates', `Channel manager: rates for ${planId}, ${from} → ${to} (demo: not sent)`);
    save(db);
  },
  async addBlock(rtId, from, to, units, reason) {
    const db = load();
    if (to <= from) throw new Error('End must be after start');
    db.blocks.push({ id: uid(), room_type_id: rtId, date_from: from, date_to: to, units, reason });
    queueAvailability(db, rtId, from, to);
    save(db);
  },
  async reservations(property, from, to) {
    const db = load(); const now = Date.now();
    return db.reservations
      .map((r) => (r.status === 'hold' && r.hold_expires_at && Date.parse(r.hold_expires_at) <= now ? { ...r, status: 'expired' as Status } : r))
      .filter((r) => (!property || r.property_id === property) && r.check_in < to && r.check_out > from)
      .sort((a, b) => a.check_in.localeCompare(b.check_in));
  },
  async rooms(property) { const db = load(); const ids = db.roomTypes.filter((r) => r.property_id === property).map((r) => r.id); return db.rooms.filter((r) => ids.includes(r.room_type_id)); },
  async setStatus(id, status, roomId) {
    const db = load(); const r = db.reservations.find((x) => x.id === id);
    if (!r) throw new Error('Not found');
    const ok = [['confirmed', 'checked_in'], ['checked_in', 'checked_out'], ['confirmed', 'no_show'], ['confirmed', 'cancelled'], ['hold', 'cancelled']].some(([a, b]) => a === r.status && b === status);
    if (!ok) throw new Error(`Cannot go from ${r.status} to ${status}`);
    if (roomId !== undefined) r.room_id = roomId;
    if (status === 'checked_out' && r.room_id) { const room = db.rooms.find((x) => x.id === r.room_id); if (room) room.housekeeping = 'dirty'; }
    r.status = status;
    if (['cancelled', 'no_show'].includes(status)) queueAvailability(db, r.room_type_id, r.check_in, r.check_out);
    save(db);
  },
  async staffConfirm(holdId, amount, method, source) {
    const db = load(); const r = db.reservations.find((x) => x.id === holdId);
    if (!r || r.status !== 'hold') throw new Error('Only a held reservation can be confirmed');
    r.status = 'confirmed'; r.paid += amount; r.hold_expires_at = null; r.source = source || r.source;
    if (amount > 0) r.notes = (r.notes + `\nPaid ${amount} by ${method}`).trim();
    save(db);
  },
  async channelEvents() { return load().events; },
  async simulateOtaBooking(property) {
    const db = load();
    const rts = db.roomTypes.filter((r) => r.property_id === property);
    const rt = rts[Math.floor(Math.random() * rts.length)];
    const ci = addDays(todayIST(), 2 + Math.floor(Math.random() * 20)), co = addDays(ci, 2 + Math.floor(Math.random() * 4));
    const src = ['booking_com', 'airbnb', 'agoda', 'mmt', 'goibibo'][Math.floor(Math.random() * 5)];
    const plan = db.ratePlans.find((p) => p.room_type_id === rt.id)!;
    const sub = nightsBetween(ci, co).reduce((a, n) => a + (db.rates[`${plan.id}|${n}`]?.price ?? 0), 0);
    const over = nightsBetween(ci, co).some((n) => dayStats(db, rt.id, n).available < 1);
    const r: Reservation = { id: uid(), code: code(), property_id: property, status: 'confirmed', source: src, ota_reservation_id: `${src.toUpperCase()}-${Math.floor(Math.random() * 1e7)}`,
      check_in: ci, check_out: co, adults: 2, subtotal: sub, tax: 0, total: sub, paid: 0, currency: 'INR', hold_expires_at: null, overbooked: over, notes: 'Simulated OTA booking', created_at: new Date().toISOString(),
      guest: { name: 'OTA guest (simulated)', email: null, phone: null, country: null }, room_type_id: rt.id, rate_plan_id: plan.id, room_id: null };
    db.reservations.push(r);
    logEvent(db, 'in', 'booking', `New ${src} booking ${r.ota_reservation_id}: ${rt.name}, ${ci} → ${co}${over ? ' (OVERBOOKED)' : ''}`, !over);
    queueAvailability(db, rt.id, ci, co);
    save(db);
    return r;
  },
  async demoPay(id) {
    const db = load(); const r = db.reservations.find((x) => x.id === id);
    if (!r) throw new Error('Not found');
    if (r.status !== 'hold') throw new Error('This booking is no longer pending');
    if (r.hold_expires_at && Date.parse(r.hold_expires_at) <= Date.now()) throw new Error('Your 15-minute hold expired. Search again.');
    r.status = 'confirmed'; r.paid = r.total; r.hold_expires_at = null;
    logEvent(db, 'in', 'payment', `Demo payment for ${r.code}: ${r.total}`);
    save(db);
  },
  async reset() { localStorage.removeItem(KEY); load(); },
};
