-- Align the original schema with the columns used by the running discovery API.
-- Safe to run after schema.sql and on an existing database.

alter table hackathons
  add column if not exists url text,
  add column if not exists platform text not null default 'unknown',
  add column if not exists location text not null default '',
  add column if not exists is_online boolean not null default true,
  add column if not exists status text not null default 'upcoming'
    check (status in ('pending', 'upcoming', 'active', 'expired')),
  add column if not exists views_count integer not null default 0,
  add column if not exists apply_count integer not null default 0,
  add column if not exists organizer_email text;

-- Preserve listings created with the original link/source/location_city schema.
update hackathons
set
  url = coalesce(nullif(url, ''), link),
  platform = case when platform = 'unknown' then coalesce(nullif(source, ''), 'unknown') else platform end,
  location = case
    when location = '' then concat_ws(', ', nullif(location_city, ''), nullif(location_country, ''))
    else location
  end,
  is_online = case when mode = 'online' then true else false end,
  status = case when is_expired then 'expired' else 'upcoming' end;

-- The API now writes url/platform. Keep legacy columns for old records, but
-- do not require new crawler and organizer submissions to populate them.
alter table hackathons alter column link drop not null;
alter table hackathons alter column source drop not null;

create index if not exists idx_hackathons_discovery_status
  on hackathons (status, start_date);

create index if not exists idx_hackathons_location
  on hackathons (latitude, longitude)
  where latitude is not null and longitude is not null;
