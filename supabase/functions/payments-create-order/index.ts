// Creates a Razorpay order for a held reservation. The amount comes from the
// database, never from the browser.
import { db, cors, json } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: h });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405, h);
  let body: { reservation_id?: string; email?: string };
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400, h); }
  if (!body.reservation_id || !/^[0-9a-f-]{36}$/.test(body.reservation_id)) return json({ error: 'Bad reservation' }, 400, h);

  const { data: r } = await db.from('reservations').select('id, code, status, total, paid, currency, hold_expires_at, guest:guests(email)').eq('id', body.reservation_id).maybeSingle();
  if (!r || (r.guest as any)?.email !== String(body.email ?? '').trim().toLowerCase()) return json({ error: 'Booking not found' }, 404, h);
  if (r.status !== 'hold' || new Date(r.hold_expires_at).getTime() <= Date.now()) return json({ error: 'This hold has expired. Search again.' }, 409, h);

  const due = Math.round((Number(r.total) - Number(r.paid)) * 100); // paise
  const keyId = Deno.env.get('RAZORPAY_KEY_ID')!, secret = Deno.env.get('RAZORPAY_KEY_SECRET')!;
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Basic ' + btoa(`${keyId}:${secret}`) },
    body: JSON.stringify({ amount: due, currency: r.currency, receipt: r.code, notes: { reservation_id: r.id, code: r.code } }),
  });
  const order = await res.json();
  if (!res.ok) return json({ error: 'Payment provider error' }, 502, h);
  await db.from('payments').insert({ reservation_id: r.id, provider: 'razorpay', provider_order_id: order.id, amount: due / 100, status: 'created' });
  return json({ order_id: order.id, amount: due, currency: r.currency, key_id: keyId }, 200, h);
});
