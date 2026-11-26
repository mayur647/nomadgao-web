-- SAMPLE data so the system runs end to end. Replace room types, rates and
-- rooms with your real setup (the same ones configured in Stayflexi today).
insert into public.properties (id, name) values
  ('vila-nova', 'NomadGao Vila Nova, Anjuna'),
  ('dharamkot', 'NomadGao Dharamkot')
on conflict (id) do nothing;

insert into public.room_types (id, property_id, name, description, units, max_adults, sort) values
  ('vn-private',  'vila-nova', 'Private room',               'Double bed, private bathroom, coworking access.', 8, 2, 1),
  ('vn-balcony',  'vila-nova', 'Private room with balcony',  'Double bed, balcony, private bathroom, coworking access.', 4, 2, 2),
  ('dk-mountain', 'dharamkot', 'Mountain-view room',         'Double bed, mountain view, private bathroom, coworking access.', 6, 2, 1),
  ('dk-standard', 'dharamkot', 'Standard room',              'Double bed, private bathroom, coworking access.', 6, 2, 2)
on conflict (id) do nothing;

insert into public.rate_plans (id, room_type_id, name, refundable, free_cancel_days, extra_adult_price) values
  ('vn-private-flex',  'vn-private',  'Flexible',        true, 7, 0),
  ('vn-private-nr',    'vn-private',  'Non-refundable',  false, 0, 0),
  ('vn-balcony-flex',  'vn-balcony',  'Flexible',        true, 7, 0),
  ('dk-mountain-flex', 'dk-mountain', 'Flexible',        true, 7, 0),
  ('dk-standard-flex', 'dk-standard', 'Flexible',        true, 7, 0)
on conflict (id) do nothing;

-- Sample nightly prices (INR) for the next 365 days.
insert into public.rates (rate_plan_id, night, price, min_stay)
select p.id, d::date,
  case p.id when 'vn-private-flex' then 2200 when 'vn-private-nr' then 1980 when 'vn-balcony-flex' then 2800
            when 'dk-mountain-flex' then 2400 else 1900 end
  + case when extract(isodow from d) in (5, 6) then 300 else 0 end,
  1
from public.rate_plans p, generate_series(current_date, current_date + 364, interval '1 day') d
on conflict do nothing;

insert into public.rooms (id, room_type_id, name)
select 'vn-' || (100 + g), case when g <= 8 then 'vn-private' else 'vn-balcony' end, 'Room ' || (100 + g) from generate_series(1, 12) g
union all
select 'dk-' || (200 + g), case when g <= 6 then 'dk-mountain' else 'dk-standard' end, 'Room ' || (200 + g) from generate_series(1, 12) g
on conflict do nothing;

delete from public.channel_outbox; -- seeding is not a change to push
