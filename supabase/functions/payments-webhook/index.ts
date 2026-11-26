// Razorpay webhook (events: payment.captured, order.paid). Verifies the
// signature, then confirms the reservation. Safe to receive twice.
import { db, json, hmacHex, safeEqual } from '../_shared/db.ts';

Deno.serve(async (req) => {
  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  const expected = await hmacHex(Deno.env.get('RAZORPAY_WEBHOOK_SECRET')!, raw);
  if (!safeEqual(sig, expected)) return json({ error: 'bad signature' }, 401);

  const evt = JSON.parse(raw);
  const pay = evt?.payload?.payment?.entity;
  if (!pay || !['payment.captured', 'order.paid'].includes(evt.event)) return json({ ok: true, ignored: evt?.event });

  const { data: p } = await db.from('payments').select('reservation_id').eq('provider_order_id', pay.order_id).maybeSingle();
  if (!p) return json({ error: 'unknown order' }, 404);
  const { error } = await db.rpc('confirm_reservation', { p_reservation: p.reservation_id, p_amount: pay.amount / 100, p_provider_order: pay.order_id, p_provider_payment: pay.id });
  if (error) return json({ error: error.message }, 500);
  await db.from('payments').update({ status: 'paid', provider_payment_id: pay.id }).eq('provider_order_id', pay.order_id).eq('status', 'created');
  // TODO: send the confirmation email (Resend / Postmark) and WhatsApp message here.
  return json({ ok: true });
});
