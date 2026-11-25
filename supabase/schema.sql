-- NomadGao community backend (Supabase / Postgres).
-- Run once in the Supabase SQL editor. Then set PUBLIC_SUPABASE_URL and
-- PUBLIC_SUPABASE_ANON_KEY as GitHub repository variables and redeploy.
--
-- Access model:
--  * Anyone can request a sign-in link, but only emails in `members`
--    (confirmed guests, Passport holders, staff) can see or write community data.
--  * A member can edit only their own profile and RSVPs.
--  * Hellos are readable only by their recipient, via my_hellos().

create extension if not exists citext;

create table if not exists public.members (
  email citext primary key,
  kind text not null default 'guest' check (kind in ('guest', 'passport', 'staff')),
  valid_until date,
  added_at timestamptz not null default now()
);
alter table public.members enable row level security;
-- No policies: only the service role (your booking sync or the dashboard) can touch it.

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m
    where m.email = (auth.jwt() ->> 'email')::citext
      and (m.valid_until is null or m.valid_until >= current_date)
  );
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role text default '' check (char_length(role) <= 60),
  home_city text default '' check (char_length(home_city) <= 40),
  location text default '' check (location in ('', 'Anjuna', 'Dharamkot', 'Lonavala')),
  stay_from date,
  stay_to date,
  show_dates boolean not null default true,
  open_to text default '' check (char_length(open_to) <= 120),
  skills text[] not null default '{}' check (cardinality(skills) <= 8),
  bio text default '' check (char_length(bio) <= 400),
  visible boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "members read visible profiles" on public.profiles
  for select to authenticated using (public.is_member() and (visible or id = auth.uid()));
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (public.is_member() and id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "delete own profile" on public.profiles
  for delete to authenticated using (id = auth.uid());

-- Keep updated_at current. (Stay dates are hidden by the profiles_public view below.)
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();

create or replace view public.profiles_public with (security_invoker = true) as
  select id, display_name, role, home_city, location,
         case when show_dates or id = auth.uid() then stay_from end as stay_from,
         case when show_dates or id = auth.uid() then stay_to end as stay_to,
         show_dates, open_to, skills, bio, visible, updated_at
  from public.profiles;

create table if not exists public.rsvps (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id text not null check (event_id ~ '^[a-z0-9-]{1,80}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.rsvps enable row level security;
create policy "read own rsvps" on public.rsvps for select to authenticated using (user_id = auth.uid());
create policy "add own rsvp" on public.rsvps for insert to authenticated with check (public.is_member() and user_id = auth.uid());
create policy "remove own rsvp" on public.rsvps for delete to authenticated using (user_id = auth.uid());

-- Counts are public (no names), so the events page can show "12 going".
create or replace function public.rsvp_counts(event_ids text[])
returns table (event_id text, going int)
language sql stable security definer set search_path = public as $$
  select r.event_id, count(*)::int from public.rsvps r
  where r.event_id = any(event_ids) group by r.event_id;
$$;
grant execute on function public.rsvp_counts(text[]) to anon, authenticated;

create table if not exists public.hellos (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id uuid not null references auth.users (id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now(),
  check (from_id <> to_id)
);
alter table public.hellos enable row level security;
create policy "send hello" on public.hellos for insert to authenticated
  with check (public.is_member() and from_id = auth.uid());
-- Rate limit: max 20 hellos per sender per day.
create or replace function public.hello_rate_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.hellos where from_id = new.from_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Too many messages today';
  end if;
  return new;
end $$;
drop trigger if exists hellos_rate on public.hellos;
create trigger hellos_rate before insert on public.hellos for each row execute function public.hello_rate_limit();

create or replace function public.my_hellos()
returns table (id uuid, from_name text, message text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select h.id, coalesce(p.display_name, 'A member'), h.message, h.created_at
  from public.hellos h left join public.profiles p on p.id = h.from_id
  where h.to_id = auth.uid() order by h.created_at desc limit 100;
$$;
grant execute on function public.my_hellos() to authenticated;
