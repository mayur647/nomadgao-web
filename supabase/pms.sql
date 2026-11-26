-- NomadGao PMS + booking engine (Postgres / Supabase).
-- Run after schema.sql. Safe to re-run: it drops and recreates functions only.
--
-- Model
--   property → room_types (units = sellable rooms of that type) → rate_plans
--   rates: one row per rate plan per night (price, min stay, stop sell, CTA/CTD)
--   reservations → reservation_rooms → stay_nights (one row per room per night)
--   availability(room type, night) = units − blocks − nights held by live reservations
--   Every change to availability or rates queues a row in channel_outbox; the
--   channex-sync function pushes those to Channex, which updates the OTAs.
--
-- Safety
--   * Guests never touch tables. They call quote() and create_hold() only.
--   * Prices are always computed in the database, never taken from the browser.
--   * create_hold() locks the room type row, so two guests cannot take the last room.
--   * Holds expire after 15 minutes unless payment confirms them.

create extension if not exists pgcrypto;

-- ---------- reference data ----------
create table if not exists public.properties (
  id text primary key,                       -- 'vila-nova', 'dharamkot'
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  check_in_time time not null default '13:00',
  check_out_time time not null default '11:00',
  tax_rate numeric(5,4) not null default 0.12,  -- TODO: confirm GST slab per tariff
  channex_property_id text
);

create table if not exists public.room_types (
  id text primary key,                       -- 'vn-private'
  property_id text not null references public.properties on delete cascade,
  name text not null,
  description text default '',
  units int not null check (units >= 0),
  max_adults int not null default 2 check (max_adults > 0),
  sort int not null default 0,
  channex_room_type_id text
);

create table if not exists public.rooms (
  id text primary key,                       -- 'vn-101'
  room_type_id text not null references public.room_types on delete cascade,
  name text not null,
  housekeeping text not null default 'clean' check (housekeeping in ('clean', 'dirty', 'inspect', 'out_of_order'))
);

create table if not exists public.rate_plans (
  id text primary key,                       -- 'vn-private-flex'
  room_type_id text not null references public.room_types on delete cascade,
  name text not null,                        -- 'Flexible', 'Non-refundable', 'Monthly'
  refundable boolean not null default true,
  free_cancel_days int not null default 7,
  extra_adult_price numeric(10,2) not null default 0,
  channex_rate_plan_id text
);

create table if not exists public.rates (
  rate_plan_id text not null references public.rate_plans on delete cascade,
  night date not null,
  price numeric(10,2) not null check (price >= 0),
  min_stay int not null default 1 check (min_stay >= 1),
  stop_sell boolean not null default false,
  closed_to_arrival boolean not null default false,
  closed_to_departure boolean not null default false,
  primary key (rate_plan_id, night)
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  room_type_id text not null references public.room_types on delete cascade,
  date_from date not null,
  date_to date not null,                     -- exclusive
  units int not null default 1 check (units > 0),
  reason text default '',
  check (date_to > date_from)
);

-- ---------- reservations ----------
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (phone is null or char_length(phone) <= 25),
  country text,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  code text unique not null default ('NG-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6))),
  property_id text not null references public.properties,
  guest_id uuid references public.guests,
  status text not null check (status in ('hold', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'expired')),
  source text not null default 'direct',     -- direct | walk_in | phone | booking_com | airbnb | expedia | agoda | mmt | goibibo | …
  ota_reservation_id text,
  check_in date not null,
  check_out date not null,
  adults int not null check (adults between 1 and 20),
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  currency text not null default 'INR',
  hold_expires_at timestamptz,
  overbooked boolean not null default false,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (source, ota_reservation_id)
);
create index if not exists reservations_dates on public.reservations (property_id, check_in, check_out);

create table if not exists public.reservation_rooms (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations on delete cascade,
  room_type_id text not null references public.room_types,
  rate_plan_id text references public.rate_plans,
  room_id text references public.rooms,
  adults int not null default 1
);

create table if not exists public.stay_nights (
  reservation_room_id uuid not null references public.reservation_rooms on delete cascade,
  room_type_id text not null references public.room_types,
  night date not null,
  price numeric(10,2) not null,
  primary key (reservation_room_id, night)
);
create index if not exists stay_nights_type_night on public.stay_nights (room_type_id, night);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text unique,
  provider_payment_id text unique,
  amount numeric(12,2) not null,
  status text not null check (status in ('created', 'paid', 'failed', 'refunded')),
  created_at timestamptz not null default now()
);

-- ---------- channel manager plumbing ----------
create table if not exists public.channel_outbox (
  id bigserial primary key,
  kind text not null check (kind in ('availability', 'rates')),
  room_type_id text not null,
  rate_plan_id text,
  date_from date not null,
  date_to date not null,                     -- exclusive
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  error text
);
create index if not exists channel_outbox_pending on public.channel_outbox (created_at) where sent_at is null;

create table if not exists public.channel_log (
  id bigserial primary key,
  direction text not null check (direction in ('out', 'in')),
  kind text not null,
  ok boolean not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.staff (
  email text primary key,
  role text not null default 'front_desk' check (role in ('owner', 'manager', 'front_desk'))
);

-- ---------- helpers ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- Live reservations hold inventory: confirmed / in house, and holds that have not expired.
create or replace function public.is_live(status text, hold_expires_at timestamptz) returns boolean
language sql immutable as $$
  select status in ('confirmed', 'checked_in') or (status = 'hold' and hold_expires_at > now());
$$;

-- Rooms left per night for one room type, over [p_from, p_to).
create or replace function public.availability(p_room_type text, p_from date, p_to date)
returns table (night date, units int, sold int, blocked int, available int)
language sql stable security definer set search_path = public as $$
  with days as (select generate_series(p_from, p_to - 1, interval '1 day')::date as night),
  rt as (select units from public.room_types where id = p_room_type)
  select d.night,
         rt.units,
         coalesce((select count(*)::int from public.stay_nights sn
                   join public.reservation_rooms rr on rr.id = sn.reservation_room_id
                   join public.reservations r on r.id = rr.reservation_id
                   where sn.room_type_id = p_room_type and sn.night = d.night
                     and (r.status in ('confirmed', 'checked_in') or (r.status = 'hold' and r.hold_expires_at > now()))), 0),
         coalesce((select sum(b.units)::int from public.blocks b
                   where b.room_type_id = p_room_type and d.night >= b.date_from and d.night < b.date_to), 0),
         0
  from days d, rt
$$;

-- Same, with available = max(0, units - sold - blocked).
create or replace function public.availability_left(p_room_type text, p_from date, p_to date)
returns table (night date, available int)
language sql stable security definer set search_path = public as $$
  select a.night, greatest(0, a.units - a.sold - a.blocked) from public.availability(p_room_type, p_from, p_to) a;
$$;

-- ---------- public: quote ----------
-- Every room type + rate plan that can be sold for the stay, with nightly prices and totals.
drop function if exists public.quote(text, date, date, int);
create function public.quote(p_property text, p_check_in date, p_check_out date, p_adults int)
returns table (
  room_type_id text, room_type_name text, description text, max_adults int,
  rate_plan_id text, rate_plan_name text, refundable boolean, free_cancel_days int,
  available int, nights int, nightly jsonb, subtotal numeric, tax numeric, total numeric, currency text, reason text
)
language plpgsql stable security definer set search_path = public as $$
declare
  n int := p_check_out - p_check_in;
  prop public.properties;
begin
  if p_check_in < (now() at time zone 'Asia/Kolkata')::date then raise exception 'Check-in is in the past'; end if;
  if n < 1 or n > 120 then raise exception 'Stay must be between 1 and 120 nights'; end if;
  if p_adults < 1 or p_adults > 20 then raise exception 'Adults must be between 1 and 20'; end if;
  select * into prop from public.properties where id = p_property;
  if not found then raise exception 'Unknown property'; end if;

  return query
  with rp as (
    select rt.id rt_id, rt.name rt_name, rt.description, rt.max_adults, rt.sort,
           p.id rp_id, p.name rp_name, p.refundable, p.free_cancel_days, p.extra_adult_price
    from public.room_types rt join public.rate_plans p on p.room_type_id = rt.id
    where rt.property_id = p_property
  ),
  priced as (
    select rp.*,
      (select count(*) from public.rates r where r.rate_plan_id = rp.rp_id and r.night >= p_check_in and r.night < p_check_out) as priced_nights,
      (select jsonb_agg(jsonb_build_object('night', r.night, 'price', r.price + greatest(0, p_adults - 2) * rp.extra_adult_price) order by r.night)
         from public.rates r where r.rate_plan_id = rp.rp_id and r.night >= p_check_in and r.night < p_check_out) as nightly,
      (select sum(r.price + greatest(0, p_adults - 2) * rp.extra_adult_price)
         from public.rates r where r.rate_plan_id = rp.rp_id and r.night >= p_check_in and r.night < p_check_out) as subtotal,
      (select bool_or(r.stop_sell) from public.rates r where r.rate_plan_id = rp.rp_id and r.night >= p_check_in and r.night < p_check_out) as any_stop,
      (select r.min_stay from public.rates r where r.rate_plan_id = rp.rp_id and r.night = p_check_in) as arrival_min_stay,
      (select r.closed_to_arrival from public.rates r where r.rate_plan_id = rp.rp_id and r.night = p_check_in) as cta,
      (select r.closed_to_departure from public.rates r where r.rate_plan_id = rp.rp_id and r.night = p_check_out) as ctd,
      (select min(a.available) from public.availability_left(rp.rt_id, p_check_in, p_check_out) a) as left_units
    from rp
  )
  select priced.rt_id, priced.rt_name, priced.description, priced.max_adults,
         priced.rp_id, priced.rp_name, priced.refundable, priced.free_cancel_days,
         coalesce(priced.left_units, 0), n, coalesce(priced.nightly, '[]'::jsonb),
         round(coalesce(priced.subtotal, 0), 2),
         round(coalesce(priced.subtotal, 0) * prop.tax_rate, 2),
         round(coalesce(priced.subtotal, 0) * (1 + prop.tax_rate), 2),
         prop.currency,
         case
           when p_adults > priced.max_adults then 'Too many guests for this room'
           when priced.priced_nights < n then 'Not open for these dates yet'
           when priced.any_stop then 'Not available on some nights'
           when coalesce(priced.cta, false) then 'Arrivals are closed on this date'
           when coalesce(priced.ctd, false) then 'Departures are closed on this date'
           when n < coalesce(priced.arrival_min_stay, 1) then 'Minimum stay is ' || priced.arrival_min_stay || ' nights'
           when coalesce(priced.left_units, 0) < 1 then 'Sold out'
           else null
         end
  from priced
  order by priced.sort, priced.rt_id, priced.subtotal;
end $$;

-- ---------- public: hold ----------
-- Creates a 15-minute hold for one room. Returns the reservation id, code and total.
drop function if exists public.create_hold(text, text, date, date, int, text, text, text, text, text);
create function public.create_hold(
  p_property text, p_rate_plan text, p_check_in date, p_check_out date, p_adults int,
  p_name text, p_email text, p_phone text, p_country text, p_notes text
) returns table (reservation_id uuid, code text, total numeric, hold_expires_at timestamptz)
language plpgsql volatile security definer set search_path = public as $$
declare
  q record; g uuid; r public.reservations; rr uuid; rt_id text;
begin
  select rt.id into rt_id from public.rate_plans p join public.room_types rt on rt.id = p.room_type_id
   where p.id = p_rate_plan and rt.property_id = p_property;
  if rt_id is null then raise exception 'Unknown room or rate'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name is required'; end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email is required'; end if;

  -- Serialise bookings for this room type so the last room cannot be sold twice.
  perform 1 from public.room_types where id = rt_id for update;

  select * into q from public.quote(p_property, p_check_in, p_check_out, p_adults) x where x.rate_plan_id = p_rate_plan;
  if q is null then raise exception 'Unknown rate'; end if;
  if q.reason is not null then raise exception '%', q.reason; end if;

  -- Simple abuse guard: at most 3 live holds per email.
  if (select count(*) from public.reservations res join public.guests gg on gg.id = res.guest_id
      where lower(gg.email) = lower(p_email) and res.status = 'hold' and res.hold_expires_at > now()) >= 3 then
    raise exception 'Too many pending bookings for this email. Finish or wait 15 minutes.';
  end if;

  insert into public.guests (name, email, phone, country) values (trim(p_name), lower(trim(p_email)), nullif(trim(p_phone), ''), nullif(trim(p_country), ''))
  returning id into g;

  insert into public.reservations (property_id, guest_id, status, source, check_in, check_out, adults, subtotal, tax, total, currency, hold_expires_at, notes)
  values (p_property, g, 'hold', 'direct', p_check_in, p_check_out, p_adults, q.subtotal, q.tax, q.total, q.currency, now() + interval '15 minutes', left(coalesce(p_notes, ''), 500))
  returning * into r;

  insert into public.reservation_rooms (reservation_id, room_type_id, rate_plan_id, adults) values (r.id, rt_id, p_rate_plan, p_adults) returning id into rr;
  insert into public.stay_nights (reservation_room_id, room_type_id, night, price)
    select rr, rt_id, (e ->> 'night')::date, (e ->> 'price')::numeric from jsonb_array_elements(q.nightly) e;

  return query select r.id, r.code, r.total, r.hold_expires_at;
end $$;

-- ---------- server side: confirm / cancel / OTA import ----------
-- Called by the payment webhook (service role) once money is captured.
create or replace function public.confirm_reservation(p_reservation uuid, p_amount numeric, p_provider_order text, p_provider_payment text)
returns public.reservations
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations;
begin
  select * into r from public.reservations where id = p_reservation for update;
  if not found then raise exception 'Unknown reservation'; end if;
  insert into public.payments (reservation_id, provider_order_id, provider_payment_id, amount, status)
    values (r.id, p_provider_order, p_provider_payment, p_amount, 'paid')
    on conflict (provider_payment_id) do nothing;
  if r.status = 'hold' then
    -- If the hold lapsed but the room is still free, keep the booking; otherwise flag it.
    update public.reservations set status = 'confirmed', paid = paid + p_amount, hold_expires_at = null,
      overbooked = (r.hold_expires_at <= now() and exists (
        select 1 from public.reservation_rooms x, public.availability(x.room_type_id, r.check_in, r.check_out) a
        where x.reservation_id = r.id and a.sold > a.units - a.blocked)),
      updated_at = now()
    where id = r.id returning * into r;
  end if;
  return r;
end $$;

create or replace function public.cancel_reservation(p_reservation uuid, p_reason text default '')
returns public.reservations
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() and current_user not in ('postgres', 'service_role') then raise exception 'Not allowed'; end if;
  update public.reservations set status = 'cancelled', notes = trim(notes || E'\n' || 'Cancelled: ' || coalesce(p_reason, '')), updated_at = now()
   where id = p_reservation and status in ('hold', 'confirmed') returning * into r;
  if not found then raise exception 'Only held or confirmed reservations can be cancelled'; end if;
  return r;
end $$;

-- A booking arriving from an OTA through the channel manager. Never refused: the room
-- may already be gone (that is what overbooked flags), because the guest has paid the OTA.
create or replace function public.import_ota_booking(
  p_property text, p_source text, p_ota_id text, p_status text,
  p_check_in date, p_check_out date, p_adults int, p_room_type text, p_rate_plan text,
  p_total numeric, p_currency text, p_name text, p_email text, p_phone text, p_notes text
) returns public.reservations
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations; g uuid; rr uuid; n date;
begin
  select * into r from public.reservations where source = p_source and ota_reservation_id = p_ota_id for update;
  if found then
    if p_status = 'cancelled' then
      update public.reservations set status = 'cancelled', updated_at = now() where id = r.id returning * into r;
      return r;
    end if;
    -- Modification: replace dates and nights.
    delete from public.reservation_rooms where reservation_id = r.id;
    update public.reservations set check_in = p_check_in, check_out = p_check_out, adults = p_adults, total = p_total, updated_at = now()
      where id = r.id returning * into r;
  else
    if p_status = 'cancelled' then return null; end if;
    insert into public.guests (name, email, phone) values (coalesce(nullif(trim(p_name), ''), 'OTA guest'), lower(nullif(trim(p_email), '')), nullif(trim(p_phone), ''))
      returning id into g;
    insert into public.reservations (property_id, guest_id, status, source, ota_reservation_id, check_in, check_out, adults, subtotal, total, currency, notes)
      values (p_property, g, 'confirmed', p_source, p_ota_id, p_check_in, p_check_out, p_adults, p_total, p_total, coalesce(p_currency, 'INR'), left(coalesce(p_notes, ''), 1000))
      returning * into r;
  end if;
  perform 1 from public.room_types where id = p_room_type for update;
  insert into public.reservation_rooms (reservation_id, room_type_id, rate_plan_id, adults) values (r.id, p_room_type, p_rate_plan, p_adults) returning id into rr;
  for n in select generate_series(p_check_in, p_check_out - 1, interval '1 day')::date loop
    insert into public.stay_nights (reservation_room_id, room_type_id, night, price) values (rr, p_room_type, n, round(p_total / (p_check_out - p_check_in), 2));
  end loop;
  update public.reservations set overbooked = exists (
    select 1 from public.availability(p_room_type, p_check_in, p_check_out) a where a.sold > a.units - a.blocked)
  where id = r.id returning * into r;
  return r;
end $$;

-- ---------- channel outbox triggers ----------
create or replace function public.queue_availability() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'reservations' then
    insert into public.channel_outbox (kind, room_type_id, date_from, date_to)
      select distinct 'availability', rr.room_type_id, least(coalesce(old.check_in, new.check_in), new.check_in), greatest(coalesce(old.check_out, new.check_out), new.check_out)
      from public.reservation_rooms rr where rr.reservation_id = new.id;
  elsif tg_table_name = 'blocks' then
    insert into public.channel_outbox (kind, room_type_id, date_from, date_to)
      values ('availability', coalesce(new.room_type_id, old.room_type_id), coalesce(new.date_from, old.date_from), coalesce(new.date_to, old.date_to));
  elsif tg_table_name = 'room_types' then
    insert into public.channel_outbox (kind, room_type_id, date_from, date_to)
      values ('availability', new.id, current_date, current_date + 500);
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists reservations_outbox on public.reservations;
create trigger reservations_outbox after update of status, check_in, check_out on public.reservations
  for each row when (old.status is distinct from new.status or old.check_in is distinct from new.check_in or old.check_out is distinct from new.check_out)
  execute function public.queue_availability();
drop trigger if exists blocks_outbox on public.blocks;
create trigger blocks_outbox after insert or update or delete on public.blocks for each row execute function public.queue_availability();
drop trigger if exists room_types_outbox on public.room_types;
create trigger room_types_outbox after update of units on public.room_types for each row execute function public.queue_availability();

-- New reservation rooms (holds, direct and OTA bookings) change availability too.
create or replace function public.queue_room_nights() returns trigger
language plpgsql security definer set search_path = public as $$
declare r public.reservations;
begin
  select * into r from public.reservations where id = coalesce(new.reservation_id, old.reservation_id);
  if r.id is not null then
    insert into public.channel_outbox (kind, room_type_id, date_from, date_to)
      values ('availability', coalesce(new.room_type_id, old.room_type_id), r.check_in, r.check_out);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists reservation_rooms_outbox on public.reservation_rooms;
create trigger reservation_rooms_outbox after insert or delete on public.reservation_rooms for each row execute function public.queue_room_nights();

create or replace function public.queue_rates() returns trigger
language plpgsql security definer set search_path = public as $$
declare rp public.rate_plans;
begin
  select * into rp from public.rate_plans where id = coalesce(new.rate_plan_id, old.rate_plan_id);
  insert into public.channel_outbox (kind, room_type_id, rate_plan_id, date_from, date_to)
    values ('rates', rp.room_type_id, rp.id, coalesce(new.night, old.night), coalesce(new.night, old.night) + 1);
  return coalesce(new, old);
end $$;
drop trigger if exists rates_outbox on public.rates;
create trigger rates_outbox after insert or update or delete on public.rates for each row execute function public.queue_rates();

-- Staff bulk rate update: one call per date range.
create or replace function public.set_rates(p_rate_plan text, p_from date, p_to date, p_price numeric, p_min_stay int default null, p_stop_sell boolean default null)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() and current_user not in ('postgres', 'service_role') then raise exception 'Not allowed'; end if;
  if p_to <= p_from or p_to - p_from > 500 then raise exception 'Bad date range'; end if;
  insert into public.rates (rate_plan_id, night, price, min_stay, stop_sell)
    select p_rate_plan, d::date, p_price, coalesce(p_min_stay, 1), coalesce(p_stop_sell, false)
    from generate_series(p_from, p_to - 1, interval '1 day') d
  on conflict (rate_plan_id, night) do update set
    price = coalesce(excluded.price, rates.price),
    min_stay = coalesce(p_min_stay, rates.min_stay),
    stop_sell = coalesce(p_stop_sell, rates.stop_sell);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- access ----------
alter table public.properties enable row level security;
alter table public.room_types enable row level security;
alter table public.rooms enable row level security;
alter table public.rate_plans enable row level security;
alter table public.rates enable row level security;
alter table public.blocks enable row level security;
alter table public.guests enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_rooms enable row level security;
alter table public.stay_nights enable row level security;
alter table public.payments enable row level security;
alter table public.channel_outbox enable row level security;
alter table public.channel_log enable row level security;
alter table public.staff enable row level security;

do $$
declare t text;
begin
  -- Public can read the catalogue (property, room types, rate plans); nothing else.
  foreach t in array array['properties', 'room_types', 'rate_plans'] loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
  end loop;
  -- Staff can do everything on operational tables.
  foreach t in array array['properties', 'room_types', 'rooms', 'rate_plans', 'rates', 'blocks', 'guests', 'reservations', 'reservation_rooms', 'stay_nights', 'payments', 'channel_outbox', 'channel_log'] loop
    execute format('drop policy if exists "staff all" on public.%I', t);
    execute format('create policy "staff all" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t);
  end loop;
end $$;

drop policy if exists "staff read staff" on public.staff;
create policy "staff read staff" on public.staff for select to authenticated using (public.is_staff());

-- Function permissions: guests get quote + create_hold + availability; the rest is server or staff only.
revoke execute on all functions in schema public from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.quote(text, date, date, int) to anon, authenticated;
    grant execute on function public.create_hold(text, text, date, date, int, text, text, text, text, text) to anon, authenticated;
    grant execute on function public.availability_left(text, date, date) to anon, authenticated;
    grant execute on function public.availability(text, date, date) to authenticated;
    grant execute on function public.is_staff() to authenticated;
    grant execute on function public.set_rates(text, date, date, numeric, int, boolean) to authenticated;
    grant execute on function public.cancel_reservation(uuid, text) to authenticated;
  end if;
end $$;

-- Guest-facing lookup for the confirmation page: needs the code AND the email.
drop function if exists public.get_booking(text, text);
create function public.get_booking(p_code text, p_email text)
returns table (code text, status text, property text, room text, check_in date, check_out date, adults int, total numeric, paid numeric, currency text, hold_expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.code, r.status, p.name, rt.name, r.check_in, r.check_out, r.adults, r.total, r.paid, r.currency, r.hold_expires_at
  from public.reservations r
  join public.guests g on g.id = r.guest_id
  join public.properties p on p.id = r.property_id
  left join public.reservation_rooms rr on rr.reservation_id = r.id
  left join public.room_types rt on rt.id = rr.room_type_id
  where r.code = upper(trim(p_code)) and lower(g.email) = lower(trim(p_email))
  limit 1;
$$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.get_booking(text, text) to anon, authenticated;
  end if;
end $$;

-- ---------- staff actions ----------
create or replace function public.staff_confirm(p_reservation uuid, p_amount numeric, p_method text, p_source text default null)
returns public.reservations
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into r from public.reservations where id = p_reservation for update;
  if r.status <> 'hold' then raise exception 'Only a held reservation can be confirmed'; end if;
  if coalesce(p_amount, 0) > 0 then
    insert into public.payments (reservation_id, provider, amount, status) values (r.id, coalesce(p_method, 'cash'), p_amount, 'paid');
  end if;
  update public.reservations set status = 'confirmed', paid = paid + coalesce(p_amount, 0), hold_expires_at = null,
    source = coalesce(p_source, source), updated_at = now() where id = r.id returning * into r;
  return r;
end $$;

create or replace function public.set_reservation_status(p_reservation uuid, p_status text, p_room text default null)
returns public.reservations
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations; ok boolean;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into r from public.reservations where id = p_reservation for update;
  ok := (r.status, p_status) in (('confirmed','checked_in'), ('checked_in','checked_out'), ('confirmed','no_show'), ('confirmed','cancelled'), ('hold','cancelled'));
  if not ok then raise exception 'Cannot go from % to %', r.status, p_status; end if;
  if p_room is not null then
    update public.reservation_rooms set room_id = p_room where reservation_id = r.id;
  end if;
  if p_status = 'checked_out' then
    update public.rooms set housekeeping = 'dirty' where id in (select room_id from public.reservation_rooms where reservation_id = r.id and room_id is not null);
  end if;
  update public.reservations set status = p_status, updated_at = now() where id = r.id returning * into r;
  return r;
end $$;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant execute on function public.staff_confirm(uuid, numeric, text, text) to authenticated;
    grant execute on function public.set_reservation_status(uuid, text, text) to authenticated;
  end if;
end $$;
