import { api, isDemo, inr, fmtDay, todayIST, addDays, type Reservation, type Status, type Property, type RoomType, type RatePlan } from '../pms/api';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const toast = (t: string) => { const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t; document.body.append(el); setTimeout(() => el.remove(), 3000); };

const SOURCE: Record<string, string> = { direct: 'Website', walk_in: 'Walk-in', phone: 'Phone', booking_com: 'Booking.com', airbnb: 'Airbnb', agoda: 'Agoda', expedia: 'Expedia', mmt: 'MakeMyTrip', goibibo: 'Goibibo' };
const STATUS_COLOR: Record<string, string> = { confirmed: '#e5f4e4', checked_in: '#e7f1fb', checked_out: '#f0efec', hold: '#f9eeda', cancelled: '#fbebeb', expired: '#f0efec', no_show: '#fbebeb' };
const pill = (s: string) => `<span class="pill" style="background:${STATUS_COLOR[s] ?? '#f0efec'}">${esc(s.replace('_', ' '))}</span>`;

let cat: { properties: Property[]; roomTypes: RoomType[]; ratePlans: RatePlan[] };
let property = '';
let calFrom = todayIST();
let resCache: Reservation[] = [];

// ---------- auth ----------
async function boot() {
  const who = await api.staffUser();
  $('#pms-login').hidden = !!who; $('#pms-app').hidden = !who;
  if (!who) return;
  $('#pms-who').textContent = who;
  $('#pms-demo').hidden = !isDemo;
  cat = await api.catalogue();
  const sel = $('#pms-property') as HTMLSelectElement;
  sel.innerHTML = cat.properties.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  property = sessionStorage.getItem('ng_pms_prop') && cat.properties.some((p) => p.id === sessionStorage.getItem('ng_pms_prop')) ? sessionStorage.getItem('ng_pms_prop')! : cat.properties[0]?.id ?? '';
  sel.value = property;
  $('#ch-sim-box').hidden = !api.simulateOtaBooking;
  refresh();
}
$('#pms-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api.staffSignIn(((e.target as HTMLFormElement).elements.namedItem('email') as HTMLInputElement).value);
  $('#pms-login-msg').textContent = r.message;
  if (r.ok && isDemo) boot();
});
$('#pms-signout').addEventListener('click', async () => { await api.staffSignOut(); boot(); });
$('#pms-reset').addEventListener('click', async () => { if (api.reset) { await api.reset(); toast('Demo data reset'); boot(); } });
$('#pms-property').addEventListener('change', (e) => { property = (e.target as HTMLSelectElement).value; sessionStorage.setItem('ng_pms_prop', property); refresh(); });

// ---------- tabs ----------
let tab = 'today';
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab!;
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  refresh();
}));
function refresh() {
  ({ today, calendar, reservations: resList, new: newForm, channels } as Record<string, () => Promise<void> | void>)[tab]?.();
}

// ---------- today ----------
const rtName = (id: string) => cat.roomTypes.find((r) => r.id === id)?.name ?? id;
function resCard(r: Reservation, action?: { label: string; status: Status }) {
  return `<div class="res-row" data-open="${esc(r.id)}" role="button" tabindex="0">
    <span><strong>${esc(r.guest.name)}</strong> ${pill(r.status)}${r.overbooked ? ' <span class="pill" style="background:#fbebeb;color:#B23A22">overbooked</span>' : ''}<br>
    <span class="muted" style="font-size:14px">${esc(rtName(r.room_type_id))}${r.room_id ? ' · ' + esc(r.room_id) : ''} · ${fmtDay(r.check_in)} → ${fmtDay(r.check_out)} · ${esc(SOURCE[r.source] ?? r.source)}</span></span>
    ${action ? `<button class="btn small" type="button" data-act="${action.status}" data-id="${esc(r.id)}">${action.label}</button>` : ''}
  </div>`;
}
async function today() {
  const t = todayIST();
  const [res, rooms, grid] = await Promise.all([api.reservations(property, addDays(t, -60), addDays(t, 60)), api.rooms(property), api.grid(property, t, 1)]);
  resCache = res;
  const live = res.filter((r) => ['confirmed', 'checked_in'].includes(r.status));
  const arrivals = live.filter((r) => r.check_in === t && r.status === 'confirmed');
  const departures = res.filter((r) => r.check_out === t && r.status === 'checked_in');
  const inhouse = res.filter((r) => r.status === 'checked_in');
  const units = grid.roomTypes.reduce((a, x) => a + x.days[0].units, 0);
  const sold = grid.roomTypes.reduce((a, x) => a + x.days[0].sold, 0);
  const revenue = live.filter((r) => r.check_in <= t && t < r.check_out).reduce((a, r) => a + r.subtotal / Math.max(1, (Date.parse(r.check_out) - Date.parse(r.check_in)) / 864e5), 0);
  const stat = (label: string, value: string) => `<div class="card" style="padding:14px"><p class="label muted">${label}</p><p style="font-family:var(--display);font-weight:800;font-size:30px">${value}</p></div>`;
  $('#today-stats').innerHTML = stat('Occupancy tonight', units ? Math.round((sold / units) * 100) + '%' : '–') + stat('Rooms sold', `${sold}/${units}`) + stat('Arrivals', String(arrivals.length)) + stat('Departures', String(departures.length)) + stat('Room revenue tonight', inr(revenue));
  $('#today-arrivals').innerHTML = arrivals.map((r) => resCard(r, { label: 'Check in', status: 'checked_in' })).join('') || '<p class="muted">None</p>';
  $('#today-departures').innerHTML = departures.map((r) => resCard(r, { label: 'Check out', status: 'checked_out' })).join('') || '<p class="muted">None</p>';
  $('#today-inhouse').innerHTML = inhouse.map((r) => resCard(r)).join('') || '<p class="muted">Nobody yet</p>';
  const hk: Record<string, string> = { clean: '#e5f4e4', dirty: '#f9eeda', inspect: '#e7f1fb', out_of_order: '#fbebeb' };
  $('#today-rooms').innerHTML = rooms.map((room) => {
    const guest = inhouse.find((r) => r.room_id === room.id);
    return `<div style="background:${hk[room.housekeeping]};border:2px solid var(--ink);border-radius:12px;padding:10px"><strong>${esc(room.name)}</strong><br><span style="font-size:12px">${esc(guest ? guest.guest.name.split(' ')[0] : 'Empty')} · ${esc(room.housekeeping.replace('_', ' '))}</span></div>`;
  }).join('');
}

// ---------- calendar ----------
async function calendar() {
  const g = await api.grid(property, calFrom, 14);
  const head = `<tr><th></th>${g.nights.map((n) => `<th class="${[6, 0].includes(new Date(n).getUTCDay()) ? 'wkend' : ''}">${fmtDay(n, { weekday: 'short' })}<br>${fmtDay(n, { day: 'numeric', month: 'short' })}</th>`).join('')}</tr>`;
  const body = g.roomTypes.map(({ rt, days, plans }) =>
    `<tr class="rt"><td>${esc(rt.name)}</td>${days.map((d) => `<td class="${d.available < 1 ? 'full' : ''}" title="${d.sold} sold, ${d.blocked} blocked">${d.available}/${d.units}</td>`).join('')}</tr>` +
    plans.map(({ plan, rates }) => `<tr><td style="font-size:13px">${esc(plan.name)}</td>${rates.map((r) => `<td><button type="button" class="${r.stop_sell ? 'stop' : ''}" data-rate="${esc(plan.id)}" data-night="${r.night}" data-price="${r.price ?? ''}" aria-label="${esc(plan.name)} ${r.night}: ${r.price ?? 'no price'}">${r.price == null ? '–' : Math.round(r.price)}${r.min_stay > 1 ? `<br><small>min ${r.min_stay}</small>` : ''}</button></td>`).join('')}</tr>`).join('')
  ).join('');
  $('#cal').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  const plansHere = cat.ratePlans.filter((p) => cat.roomTypes.some((r) => r.id === p.room_type_id && r.property_id === property));
  ($('#bulk').querySelector('[name=plan]') as HTMLSelectElement).innerHTML = plansHere.map((p) => `<option value="${esc(p.id)}">${esc(rtName(p.room_type_id))} · ${esc(p.name)}</option>`).join('');
  ($('#block').querySelector('[name=rt]') as HTMLSelectElement).innerHTML = cat.roomTypes.filter((r) => r.property_id === property).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
}
$('#cal').addEventListener('click', async (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-rate]'); if (!b) return;
  const v = prompt(`New price for ${b.dataset.night} (₹). Type "stop" to stop selling, "open" to reopen.`, b.dataset.price ?? '');
  if (v === null) return;
  const patch = v.trim().toLowerCase() === 'stop' ? { stop_sell: true } : v.trim().toLowerCase() === 'open' ? { stop_sell: false } : { price: Number(v) };
  if ('price' in patch && (!Number.isFinite(patch.price) || patch.price < 0)) { toast('Enter a number'); return; }
  try { await api.setRates(b.dataset.rate!, b.dataset.night!, addDays(b.dataset.night!, 1), patch); toast('Saved and queued for channels'); calendar(); } catch (err) { toast((err as Error).message); }
});
document.querySelectorAll<HTMLButtonElement>('[data-cal]').forEach((b) => b.addEventListener('click', () => { const n = Number(b.dataset.cal); calFrom = n === 0 ? todayIST() : addDays(calFrom, n); calendar(); }));
$('#bulk').addEventListener('submit', async (e) => {
  e.preventDefault(); const d = new FormData(e.target as HTMLFormElement);
  const patch: { price?: number; min_stay?: number; stop_sell?: boolean } = {};
  if (d.get('price')) patch.price = Number(d.get('price'));
  if (d.get('min_stay')) patch.min_stay = Number(d.get('min_stay'));
  if (d.get('stop')) patch.stop_sell = d.get('stop') === 'stop';
  if (!Object.keys(patch).length) { toast('Nothing to change'); return; }
  try { await api.setRates(String(d.get('plan')), String(d.get('from')), String(d.get('to')), patch); toast('Updated'); calendar(); } catch (err) { toast((err as Error).message); }
});
$('#block').addEventListener('submit', async (e) => {
  e.preventDefault(); const d = new FormData(e.target as HTMLFormElement);
  try { await api.addBlock(String(d.get('rt')), String(d.get('from')), String(d.get('to')), Number(d.get('units')), String(d.get('reason') ?? '')); toast('Blocked'); calendar(); } catch (err) { toast((err as Error).message); }
});

// ---------- reservations ----------
async function resList() {
  const t = todayIST();
  resCache = await api.reservations(property, addDays(t, -90), addDays(t, 365));
  renderResList();
}
function renderResList() {
  const q = ($('#res-q') as HTMLInputElement).value.toLowerCase();
  const st = ($('#res-status') as HTMLSelectElement).value;
  const list = resCache.filter((r) => (!st || r.status === st) && (!q || [r.guest.name, r.code, r.guest.email, r.source, r.ota_reservation_id].join(' ').toLowerCase().includes(q)));
  $('#res-list').innerHTML = list.map((r) => resCard(r)).join('') || '<p class="muted">No reservations match.</p>';
}
$('#res-q').addEventListener('input', renderResList);
$('#res-status').addEventListener('change', renderResList);

async function openRes(id: string) {
  const r = resCache.find((x) => x.id === id); if (!r) return;
  const rooms = (await api.rooms(property)).filter((x) => x.room_type_id === r.room_type_id);
  const actions: [string, Status][] = r.status === 'confirmed' ? [['Check in', 'checked_in'], ['No-show', 'no_show'], ['Cancel', 'cancelled']] : r.status === 'checked_in' ? [['Check out', 'checked_out']] : r.status === 'hold' ? [['Cancel', 'cancelled']] : [];
  $('#res-detail').innerHTML = `
    <div class="row" style="align-items:flex-start"><div><p class="label muted">${esc(r.code)} · ${esc(SOURCE[r.source] ?? r.source)}${r.ota_reservation_id ? ' #' + esc(r.ota_reservation_id) : ''}</p><h2 class="h-m" style="font-size:28px;margin-top:6px">${esc(r.guest.name)}</h2></div>${pill(r.status)}</div>
    ${r.overbooked ? '<p class="card" style="background:#fbebeb;margin-top:12px">Overbooked: this booking arrived when the room type was already full. Move a guest or call the OTA.</p>' : ''}
    <p style="margin-top:12px">${esc(rtName(r.room_type_id))} · ${fmtDay(r.check_in)} → ${fmtDay(r.check_out)} · ${r.adults} guest${r.adults === 1 ? '' : 's'}</p>
    <p class="muted">${esc(r.guest.email ?? '')} ${esc(r.guest.phone ?? '')}</p>
    <p style="margin-top:10px">Total ${inr(r.total)} · Paid ${inr(r.paid)} · <strong>Due ${inr(Math.max(0, r.total - r.paid))}</strong></p>
    ${r.notes ? `<p class="muted" style="white-space:pre-line;margin-top:8px">${esc(r.notes)}</p>` : ''}
    ${r.status === 'confirmed' ? `<label class="field" style="margin-top:14px"><span>Room</span><select id="res-room"><option value="">Unassigned</option>${rooms.map((x) => `<option value="${esc(x.id)}" ${x.id === r.room_id ? 'selected' : ''}>${esc(x.name)} (${esc(x.housekeeping)})</option>`).join('')}</select></label>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:18px">${actions.map(([l, s]) => `<button class="btn small ${s === 'cancelled' || s === 'no_show' ? 'ghost' : ''}" type="button" data-act="${s}" data-id="${esc(r.id)}">${l}</button>`).join('')}<button class="btn small ghost" type="button" data-close>Close</button></div>`;
  ($('#res-dialog') as HTMLDialogElement).showModal();
}
document.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-close]')) { ($('#res-dialog') as HTMLDialogElement).close(); return; }
  const act = t.closest<HTMLButtonElement>('[data-act]');
  if (act) {
    e.stopPropagation();
    const status = act.dataset.act as Status;
    if ((status === 'cancelled' || status === 'no_show') && !confirm(`Mark this reservation as ${status.replace('_', ' ')}?`)) return;
    const roomSel = document.getElementById('res-room') as HTMLSelectElement | null;
    try { await api.setStatus(act.dataset.id!, status, status === 'checked_in' && roomSel ? roomSel.value || null : undefined); toast('Updated'); ($('#res-dialog') as HTMLDialogElement).close(); refresh(); } catch (err) { toast((err as Error).message); }
    return;
  }
  const open = t.closest<HTMLElement>('[data-open]');
  if (open) openRes(open.dataset.open!);
});
document.addEventListener('keydown', (e) => { const el = (e.target as HTMLElement).closest<HTMLElement>('[data-open]'); if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openRes(el.dataset.open!); } });

// ---------- new booking ----------
function newForm() {
  const f = $('#new-form') as HTMLFormElement;
  const i = f.elements.namedItem('in') as HTMLInputElement, o = f.elements.namedItem('out') as HTMLInputElement;
  if (!i.value) { i.value = todayIST(); o.value = addDays(todayIST(), 1); }
  loadPlans();
}
async function loadPlans() {
  const f = $('#new-form') as HTMLFormElement; const d = new FormData(f);
  const sel = f.elements.namedItem('plan') as HTMLSelectElement;
  try {
    const rows = await api.quote(property, String(d.get('in')), String(d.get('out')), Number(d.get('adults')) || 1);
    sel.innerHTML = rows.map((r) => `<option value="${esc(r.rate_plan_id)}" ${r.reason ? 'disabled' : ''}>${esc(r.room_type_name)} · ${esc(r.rate_plan_name)} · ${r.reason ? esc(r.reason) : inr(r.total) + ` (${r.available} left)`}</option>`).join('');
    $('#new-msg').textContent = '';
  } catch (err) { sel.innerHTML = '<option value="">—</option>'; $('#new-msg').textContent = (err as Error).message; }
}
['in', 'out', 'adults'].forEach((n) => ($('#new-form') as HTMLFormElement).elements.namedItem(n)!.addEventListener('change', loadPlans));
$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const d = new FormData(e.target as HTMLFormElement);
  try {
    const h = await api.createHold({ property, ratePlan: String(d.get('plan')), checkIn: String(d.get('in')), checkOut: String(d.get('out')), adults: Number(d.get('adults')), name: String(d.get('name')), email: String(d.get('email')), phone: String(d.get('phone') ?? '') });
    await api.staffConfirm(h.reservation_id, Number(d.get('paid')) || 0, String(d.get('method')), String(d.get('source')));
    toast(`Booked: ${h.code}`); (e.target as HTMLFormElement).reset(); newForm();
  } catch (err) { $('#new-msg').textContent = (err as Error).message; }
});

// ---------- channels ----------
async function channels() {
  $('#ch-status').textContent = isDemo
    ? 'Not connected (demo). Updates are logged below but not sent anywhere.'
    : 'Rates and availability changes are queued and pushed by the channex-sync function; OTA bookings arrive through the channex-webhook function.';
  const ev = await api.channelEvents();
  $('#ch-log').innerHTML = ev.slice(0, 80).map((x) => `<div style="display:flex;gap:10px;font-size:14px;border-bottom:1px solid var(--line);padding:6px 0"><span class="label" style="flex:0 0 120px;color:${x.ok ? 'var(--leaf)' : 'var(--laterite)'}">${x.direction === 'in' ? '← in' : 'out →'} ${esc(x.kind)}</span><span style="flex:1">${esc(x.summary)}</span><span class="muted" style="font-size:12px">${new Date(x.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') || '<p class="muted">Nothing yet.</p>';
}
$('#ch-sim').addEventListener('click', async () => { if (!api.simulateOtaBooking) return; const r = await api.simulateOtaBooking(property); toast(`${SOURCE[r.source] ?? r.source} booking ${r.code}${r.overbooked ? ' (overbooked!)' : ''}`); channels(); });

boot();
