-- Enables radius-based discovery for physical hackathons.
-- Run this once in the Supabase SQL editor before deploying the nearby API.

alter table hackathons
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table hackathons
  drop constraint if exists hackathons_latitude_range,
  drop constraint if exists hackathons_longitude_range;

alter table hackathons
  add constraint hackathons_latitude_range check (latitude is null or latitude between -90 and 90),
  add constraint hackathons_longitude_range check (longitude is null or longitude between -180 and 180);

create index if not exists idx_hackathons_location
  on hackathons (latitude, longitude)
  where latitude is not null and longitude is not null;
