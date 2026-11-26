/**
 * NomadGao booking engine: search → choose room → guest details → pay → confirmed.
 * Talks to the PMS through src/pms/api (demo store or Supabase).
 */
import { api, isDemo, inr, fmtDay, todayIST, addDays, diffDays, type QuoteRow, type Hold } from '../pms/api';
import { stays } from '../data/stays';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const SUPA = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

type State = { stay: string; property: string; checkIn: string; checkOut: string; adults: number; choice: QuoteRow | null; hold: Hold | null; email: string };
const q = new URLSearchParams(location.search);
const firstStay = stays.find((s) => s.slug === q.get('stay')) ?? stays[0];
const state: State = {
  stay: firstStay.slug, property: firstStay.pmsId,
  checkIn: q.get('in') ?? '', checkOut: q.get('out') ?? '', adults: Math.min(Math.max(Number(q.get('adults')) || 2, 1), 12),
  choice: null, hold: null, email: '',
};

const views = ['results', 'details', 'pay', 'done'] as const;
function show(view: (typeof views)[number]) {
  views.forEach((v) => ($(`#be-${v}`).hidden = v !== view));
  document.querySelectorAll<HTMLElement>('[data-be-step]').forEach((el) => el.classList.toggle('on', views.indexOf(el.dataset.beStep as any) <= views.indexOf(view)));
  $(`#be-${view}`).querySelector<HTMLElement>('h2')?.focus();
}
function error(where: string, msg: string) { const el = $(where); el.textContent = msg; el.hidden = !msg; }

// ---------- search ----------
async function search() {
  const box = $('#be-rooms');
  error('#be-search-error', '');
  if (!state.checkIn || !state.checkOut) { box.innerHTML = '<p class="muted">Choose your dates above to see rooms and prices.</p>'; show('results'); return; }
  box.innerHTML = '<p class="muted">Checking availability…</p>';
  show('results');
  try {
    const rows = await api.quote(state.property, state.checkIn, state.checkOut, state.adults);
    const stay = stays.find((s) => s.slug === state.stay)!;
    const n = diffDays(state.checkIn, state.checkOut);
    $('#be-summary').textContent = `${stay.property} · ${fmtDay(state.checkIn)} → ${fmtDay(state.checkOut)} · ${n} night${n === 1 ? '' : 's'} · ${state.adults} guest${state.adults === 1 ? '' : 's'}`;
    const byType = new Map<string, QuoteRow[]>();
    rows.forEach((r) => byType.set(r.room_type_id, [...(byType.get(r.room_type_id) ?? []), r]));
    if (!byType.size) { box.innerHTML = '<p class="muted">No rooms are set up for this property yet.</p>'; return; }
    const anyOpen = rows.some((r) => !r.reason);
    box.innerHTML = [...byType.values()].map((plans) => {
      const rt = plans[0];
      return `<article class="card" style="display:flex;flex-wrap:wrap;gap:20px">
        <div aria-hidden="true" style="flex:0 0 200px;min-height:150px;border-radius:16px;background:${stay.color}"></div>
        <div style="flex:1 1 300px;min-width:0">
          <h3 style="font-family:var(--display);font-size:26px">${esc(rt.room_type_name)}</h3>
          <p class="muted" style="font-size:15px;margin-top:4px">${esc(rt.description)} Sleeps ${rt.max_adults}.</p>
          ${rt.available > 0 && rt.available <= 2 && !plans.every((p) => p.reason) ? `<p class="label" style="color:var(--laterite);margin-top:8px">Only ${rt.available} left for these dates</p>` : ''}
          <div class="stack" style="--gap:10px;margin-top:14px">
            ${plans.map((p) => `
              <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:10px">
                <div><strong>${esc(p.rate_plan_name)}</strong><br><span class="muted" style="font-size:14px">${p.refundable ? `Free cancellation up to ${p.free_cancel_days} days before` : 'Non-refundable, lower price'}</span></div>
                <div style="text-align:right">
                  ${p.reason ? `<span class="muted" style="font-size:14px">${esc(p.reason)}</span>` : `
                    <span style="font-weight:700;font-size:20px">${inr(p.total)}</span><br>
                    <span class="muted" style="font-size:13px">${inr(p.subtotal / p.nights)}/night · incl. ${inr(p.tax)} tax</span><br>
                    <button class="btn small red" type="button" data-choose="${esc(p.rate_plan_id)}" style="margin-top:6px">Book this</button>`}
                </div>
              </div>`).join('')}
          </div>
        </div>
      </article>`;
    }).join('') + (anyOpen ? '' : `<p class="muted">Nothing is free for these exact dates. Try moving them a day or two, or <a href="${otherStayLink()}">check our other stay</a>.</p>`);
    box.querySelectorAll<HTMLButtonElement>('[data-choose]').forEach((b) => b.addEventListener('click', () => {
      state.choice = rows.find((r) => r.rate_plan_id === b.dataset.choose) ?? null;
      if (state.choice) renderDetails();
    }));
  } catch (e) {
    box.innerHTML = '';
    error('#be-search-error', (e as Error).message);
  }
}
function otherStayLink() {
  const other = stays.find((s) => s.slug !== state.stay);
  return other ? `?${new URLSearchParams({ stay: other.slug, in: state.checkIn, out: state.checkOut, adults: String(state.adults) })}` : '#';
}

// ---------- details ----------
function summaryHtml() {
  const c = state.choice!; const stay = stays.find((s) => s.slug === state.stay)!;
  return `<p class="label" style="color:var(--leaf)">${esc(stay.property)}</p>
    <p style="font-family:var(--display);font-weight:800;font-size:24px;margin:6px 0">${esc(c.room_type_name)}</p>
    <p class="muted">${esc(c.rate_plan_name)} · ${fmtDay(state.checkIn)} → ${fmtDay(state.checkOut)} · ${c.nights} night${c.nights === 1 ? '' : 's'} · ${state.adults} guest${state.adults === 1 ? '' : 's'}</p>
    <details style="border:0;padding:10px 0 0"><summary style="font-size:15px">Price per night</summary>
      ${c.nightly.map((x) => `<p style="display:flex;justify-content:space-between;font-size:15px;margin:4px 0"><span>${fmtDay(x.night)}</span><span>${inr(x.price)}</span></p>`).join('')}
    </details>
    <p style="display:flex;justify-content:space-between;margin-top:10px"><span>Room</span><span>${inr(c.subtotal)}</span></p>
    <p style="display:flex;justify-content:space-between"><span>Taxes</span><span>${inr(c.tax)}</span></p>
    <p style="display:flex;justify-content:space-between;font-weight:700;font-size:20px;border-top:2px solid var(--ink);margin-top:8px;padding-top:8px"><span>Total</span><span>${inr(c.total)}</span></p>`;
}
function renderDetails() {
  $('#be-details-summary').innerHTML = summaryHtml();
  error('#be-details-error', '');
  show('details');
}
$('#be-details-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement; const d = new FormData(f);
  const btn = f.querySelector<HTMLButtonElement>('button[type=submit]')!;
  btn.disabled = true; error('#be-details-error', '');
  try {
    state.email = String(d.get('email') ?? '');
    state.hold = await api.createHold({ property: state.property, ratePlan: state.choice!.rate_plan_id, checkIn: state.checkIn, checkOut: state.checkOut, adults: state.adults,
      name: String(d.get('name') ?? ''), email: state.email, phone: String(d.get('phone') ?? ''), country: String(d.get('country') ?? ''), notes: String(d.get('notes') ?? '') });
    renderPay();
  } catch (err) { error('#be-details-error', (err as Error).message); }
  finally { btn.disabled = false; }
});
$('#be-back').addEventListener('click', () => show('results'));

// ---------- pay ----------
let timer: number | undefined;
function renderPay() {
  $('#be-pay-summary').innerHTML = summaryHtml();
  $('#be-pay-code').textContent = state.hold!.code;
  $('#be-pay-btn').textContent = `Pay ${inr(state.hold!.total)}${isDemo ? ' (demo, no charge)' : ''}`;
  error('#be-pay-error', '');
  clearInterval(timer);
  const tick = () => {
    const left = Date.parse(state.hold!.hold_expires_at) - Date.now();
    $('#be-pay-timer').textContent = left > 0 ? `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : 'expired';
    if (left <= 0) { clearInterval(timer); error('#be-pay-error', 'Your hold expired. Search again to see current availability.'); ($('#be-pay-btn') as HTMLButtonElement).disabled = true; }
  };
  tick(); timer = window.setInterval(tick, 1000);
  ($('#be-pay-btn') as HTMLButtonElement).disabled = false;
  show('pay');
}
$('#be-pay-btn').addEventListener('click', async () => {
  const btn = $('#be-pay-btn') as HTMLButtonElement; btn.disabled = true; error('#be-pay-error', '');
  try {
    if (isDemo && api.demoPay) { await api.demoPay(state.hold!.reservation_id); return done(); }
    await payWithRazorpay();
  } catch (e) { error('#be-pay-error', (e as Error).message); btn.disabled = false; }
});

function loadRazorpay(): Promise<void> {
  if ((window as any).Razorpay) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Could not load the payment window. Check your connection.')); document.head.append(s); });
}
async function payWithRazorpay() {
  const r = await fetch(`${SUPA}/functions/v1/payments-create-order`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY!, authorization: `Bearer ${KEY}` }, body: JSON.stringify({ reservation_id: state.hold!.reservation_id, email: state.email }) });
  const order = await r.json();
  if (!r.ok) throw new Error(order.error ?? 'Could not start payment');
  await loadRazorpay();
  await new Promise<void>((resolve, reject) => {
    const rz = new (window as any).Razorpay({
      key: order.key_id, order_id: order.order_id, amount: order.amount, currency: order.currency, name: 'NomadGao', description: `Booking ${state.hold!.code}`,
      prefill: { email: state.email }, theme: { color: '#B23A22' },
      handler: () => resolve(),
      modal: { ondismiss: () => reject(new Error('Payment window closed. Your room is held until the timer runs out.')) },
    });
    rz.on('payment.failed', (resp: any) => reject(new Error(resp?.error?.description ?? 'Payment failed')));
    rz.open();
  });
  // The webhook confirms the booking on the server; wait for it.
  for (let i = 0; i < 20; i++) {
    const b = await api.getBooking(state.hold!.code, state.email);
    if (b?.status === 'confirmed') return done();
    await new Promise((r) => setTimeout(r, 1500));
  }
  done(true);
}

// ---------- done ----------
async function done(pending = false) {
  clearInterval(timer);
  const b = await api.getBooking(state.hold!.code, state.email);
  $('#be-done-title').textContent = pending ? 'Payment received. Confirming…' : "You're booked.";
  $('#be-done-body').innerHTML = `
    <p class="label" style="color:var(--leaf)">Booking ${esc(state.hold!.code)}</p>
    <p style="font-family:var(--display);font-weight:800;font-size:26px;margin:6px 0">${esc(b?.property ?? '')}</p>
    <p>${esc(b?.room ?? '')} · ${fmtDay(state.checkIn)} → ${fmtDay(state.checkOut)} · ${state.adults} guest${state.adults === 1 ? '' : 's'}</p>
    <p style="margin-top:8px">Paid ${inr(b?.paid ?? 0)} of ${inr(b?.total ?? 0)}</p>
    <p class="muted" style="margin-top:12px">${pending ? 'We will email you as soon as it is confirmed.' : `A confirmation is on its way to ${esc(state.email)}.`}${isDemo ? ' (Demo: no email is sent.)' : ''}</p>`;
  show('done');
}

// ---------- boot ----------
(() => {
  // Keep the booking box in sync and search without reloading.
  const form = document.querySelector<HTMLFormElement>('[data-booking-form]');
  if (form) {
    const set = (n: string, v: string) => { const el = form.elements.namedItem(n) as HTMLInputElement | null; if (el && v) el.value = v; };
    set('stay', state.stay); set('in', state.checkIn); set('out', state.checkOut); set('adults', String(state.adults));
  }
  if (!state.checkIn) { state.checkIn = addDays(todayIST(), 7); state.checkOut = addDays(state.checkIn, 7); if (form) { (form.elements.namedItem('in') as HTMLInputElement).value = state.checkIn; (form.elements.namedItem('out') as HTMLInputElement).value = state.checkOut; } }
  if (isDemo) $('#be-demo').hidden = false;
  search();
})();
