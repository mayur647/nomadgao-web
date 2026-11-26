// Pushes queued availability and rate changes to Channex, which updates every
// connected OTA. Run every minute with Supabase Cron (pg_cron + pg_net), or
// call it after edits. Endpoints follow docs.channex.io: check them in staging.
import { db, json } from '../_shared/db.ts';

const API = Deno.env.get('CHANNEX_API_URL') ?? 'https://staging.channex.io/api/v1';
const KEY = Deno.env.get('CHANNEX_API_KEY')!;
const call = (path: string, body: unknown) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-api-key': KEY }, body: JSON.stringify(body) });

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${Deno.env.get('SYNC_SECRET')}`) return json({ error: 'unauthorised' }, 401);
  const { data: jobs } = await db.from('channel_outbox').select('*').is('sent_at', null).lt('attempts', 8).order('id').limit(200);
  if (!jobs?.length) return json({ sent: 0 });

  const { data: rts } = await db.from('room_types').select('id, channex_room_type_id, property:properties(channex_property_id)');
  const { data: plans } = await db.from('rate_plans').select('id, room_type_id, channex_rate_plan_id');
  const rtMap = new Map((rts ?? []).map((r: any) => [r.id, r]));
  const planMap = new Map((plans ?? []).map((p: any) => [p.id, p]));

  // Merge jobs: one availability push per room type covering the widest range; rates per plan.
  const avail = new Map<string, { from: string; to: string; ids: number[] }>();
  const rates = new Map<string, { from: string; to: string; ids: number[] }>();
  for (const j of jobs) {
    const key = j.kind === 'rates' ? j.rate_plan_id : j.room_type_id;
    const m = j.kind === 'rates' ? rates : avail;
    const cur = m.get(key) ?? { from: j.date_from, to: j.date_to, ids: [] };
    cur.from = j.date_from < cur.from ? j.date_from : cur.from;
    cur.to = j.date_to > cur.to ? j.date_to : cur.to;
    cur.ids.push(j.id); m.set(key, cur);
  }

  const done: number[] = []; const failed: { ids: number[]; error: string }[] = [];
  const availValues: any[] = []; const availIds: number[] = [];
  for (const [rtId, r] of avail) {
    const rt: any = rtMap.get(rtId);
    if (!rt?.channex_room_type_id) { done.push(...r.ids); continue; } // not mapped to Channex: nothing to send
    const { data: days } = await db.rpc('availability', { p_room_type: rtId, p_from: r.from, p_to: r.to });
    for (const d of days ?? []) availValues.push({ property_id: rt.property.channex_property_id, room_type_id: rt.channex_room_type_id, date_from: d.night, date_to: d.night, availability: Math.max(0, d.units - d.sold - d.blocked) });
    availIds.push(...r.ids);
  }
  const rateValues: any[] = []; const rateIds: number[] = [];
  for (const [planId, r] of rates) {
    const plan: any = planMap.get(planId); const rt: any = plan && rtMap.get(plan.room_type_id);
    if (!plan?.channex_rate_plan_id) { done.push(...r.ids); continue; }
    const { data: rows } = await db.from('rates').select('*').eq('rate_plan_id', planId).gte('night', r.from).lt('night', r.to);
    for (const x of rows ?? []) rateValues.push({ property_id: rt.property.channex_property_id, rate_plan_id: plan.channex_rate_plan_id, date_from: x.night, date_to: x.night,
      rate: Number(x.price).toFixed(2), min_stay_arrival: x.min_stay, stop_sell: x.stop_sell, closed_to_arrival: x.closed_to_arrival, closed_to_departure: x.closed_to_departure });
    rateIds.push(...r.ids);
  }

  for (const [path, values, ids] of [['/availability', availValues, availIds], ['/restrictions', rateValues, rateIds]] as const) {
    if (!values.length) continue;
    const res = await call(path, { values });
    const text = await res.text();
    await db.from('channel_log').insert({ direction: 'out', kind: path.slice(1), ok: res.ok, detail: { count: values.length, status: res.status, body: text.slice(0, 500) } });
    if (res.ok) done.push(...ids); else failed.push({ ids: [...ids], error: `${res.status} ${text.slice(0, 200)}` });
  }
  if (done.length) await db.from('channel_outbox').update({ sent_at: new Date().toISOString() }).in('id', done);
  for (const f of failed) {
    for (const id of f.ids) {
      const job = jobs.find((j: any) => j.id === id);
      await db.from('channel_outbox').update({ attempts: (job?.attempts ?? 0) + 1, error: f.error }).eq('id', id);
    }
  }
  return json({ sent: done.length, failed: failed.reduce((a, f) => a + f.ids.length, 0) });
});
