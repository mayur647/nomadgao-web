// Channex calls this when an OTA booking is created, modified or cancelled.
// We don't trust the webhook body: we pull the booking revision feed from
// Channex, import each revision into the PMS, then acknowledge it.
import { db, json } from '../_shared/db.ts';

const API = Deno.env.get('CHANNEX_API_URL') ?? 'https://staging.channex.io/api/v1';
const KEY = Deno.env.get('CHANNEX_API_KEY')!;
const get = (path: string) => fetch(`${API}${path}`, { headers: { 'user-api-key': KEY } });
const SOURCES: Record<string, string> = { 'Booking.com': 'booking_com', BookingCom: 'booking_com', Airbnb: 'airbnb', Expedia: 'expedia', Agoda: 'agoda', MakeMyTrip: 'mmt', Goibibo: 'goibibo' };

Deno.serve(async (req) => {
  // Shared secret set as a custom header on the Channex webhook.
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('CHANNEX_WEBHOOK_SECRET')) return json({ error: 'unauthorised' }, 401);

  const { data: rts } = await db.from('room_types').select('id, property_id, channex_room_type_id');
  const { data: plans } = await db.from('rate_plans').select('id, channex_rate_plan_id');
  const rtBy = new Map((rts ?? []).map((r: any) => [r.channex_room_type_id, r]));
  const planBy = new Map((plans ?? []).map((p: any) => [p.channex_rate_plan_id, p.id]));

  const res = await get('/booking_revisions/feed');
  if (!res.ok) return json({ error: `feed ${res.status}` }, 502);
  const feed = await res.json();
  let imported = 0;
  for (const rev of feed.data ?? []) {
    const a = rev.attributes ?? {};
    const room = (a.rooms ?? [])[0] ?? {};
    const rt: any = rtBy.get(room.room_type_id);
    if (!rt) {
      await db.from('channel_log').insert({ direction: 'in', kind: 'booking', ok: false, detail: { error: 'unmapped room type', revision: rev.id, room_type_id: room.room_type_id } });
      continue; // leave unacknowledged so it is retried after mapping is fixed
    }
    const { error } = await db.rpc('import_ota_booking', {
      p_property: rt.property_id,
      p_source: SOURCES[a.ota_name] ?? String(a.ota_name ?? 'ota').toLowerCase().replace(/\W+/g, '_'),
      p_ota_id: String(a.ota_reservation_code ?? a.booking_id),
      p_status: a.status === 'cancelled' ? 'cancelled' : 'new',
      p_check_in: room.checkin_date ?? a.arrival_date,
      p_check_out: room.checkout_date ?? a.departure_date,
      p_adults: Number(room.occupancy?.adults ?? 1),
      p_room_type: rt.id,
      p_rate_plan: planBy.get(room.rate_plan_id) ?? null,
      p_total: Number(a.amount ?? 0),
      p_currency: a.currency ?? 'INR',
      p_name: [a.customer?.name, a.customer?.surname].filter(Boolean).join(' '),
      p_email: a.customer?.mail ?? null,
      p_phone: a.customer?.phone ?? null,
      p_notes: a.notes ?? '',
    });
    await db.from('channel_log').insert({ direction: 'in', kind: 'booking', ok: !error, detail: { revision: rev.id, ota: a.ota_name, code: a.ota_reservation_code, status: a.status, error: error?.message } });
    if (!error) {
      await fetch(`${API}/booking_revisions/${rev.id}/ack`, { method: 'POST', headers: { 'user-api-key': KEY } });
      imported++;
    }
  }
  return json({ imported });
});
