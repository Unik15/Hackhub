-- HackHub schema for Supabase (Postgres)
-- Run this in the Supabase SQL editor (or via `supabase db push`) before starting the backend.

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ============================================================
-- USERS
-- ============================================================
create table if not exists users (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  email                 text not null unique,
  password              text not null, -- bcrypt hash, never store plain text
  phone                 text,

  skills                text[] not null default '{}',
  experience            text not null default 'beginner'
                          check (experience in ('beginner', 'intermediate', 'advanced')),
  interests             text[] not null default '{}',
  city                  text,
  latitude              double precision,
  longitude             double precision,
  preferred_mode        text not null default 'both'
                          check (preferred_mode in ('online', 'offline', 'both')),

  notify_email          boolean not null default true,
  notify_whatsapp       boolean not null default false,
  notify_daily_digest   boolean not null default true,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_users_email on users (email);

-- ============================================================
-- HACKATHONS
-- ============================================================
create table if not exists hackathons (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text not null default '',
  domain                  text[] not null default '{}',
  tags                    text[] not null default '{}',
  link                    text not null,
  source                  text not null
                            check (source in ('devpost', 'unstop', 'college', 'manual')),

  start_date              timestamptz,
  end_date                timestamptz,
  registration_deadline   timestamptz,

  mode                    text not null default 'online'
                            check (mode in ('online', 'offline', 'hybrid')),
  location_city           text not null default '',
  location_country        text not null default '',
  latitude                double precision,
  longitude               double precision,

  prize_pool              text not null default '',
  organizer               text not null default '',

  dedupe_hash             text not null unique, -- sha256(title|source|link), prevents re-crawl duplicates
  is_expired              boolean not null default false,
  trending_score          integer not null default 0,

  -- full-text search over title/description/tags
  search_vector           tsvector generated always as (
                            setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                            setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
                            setweight(to_tsvector('english', array_to_string(coalesce(tags, '{}'), ' ')), 'C')
                          ) stored,

  created_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_hackathons_is_expired on hackathons (is_expired);
create index if not exists idx_hackathons_trending on hackathons (trending_score desc, created_at desc);
create index if not exists idx_hackathons_search on hackathons using gin (search_vector);
create index if not exists idx_hackathons_mode on hackathons (mode);

-- ============================================================
-- SAVED HACKATHONS (many-to-many join table)
-- ============================================================
create table if not exists saved_hackathons (
  user_id       uuid not null references users (id) on delete cascade,
  hackathon_id  uuid not null references hackathons (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, hackathon_id)
);

-- ============================================================
-- Keep updated_at fresh automatically
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

drop trigger if exists trg_hackathons_updated_at on hackathons;
create trigger trg_hackathons_updated_at before update on hackathons
  for each row execute function set_updated_at();

-- ============================================================
-- Atomic trending score increment (avoids read-then-write race conditions)
-- ============================================================
create or replace function increment_trending_score(hackathon_id uuid)
returns void as $$
begin
  update hackathons set trending_score = trending_score + 1 where id = hackathon_id;
end;
$$ language plpgsql;

-- ============================================================
-- Row Level Security
-- ============================================================
-- The backend talks to Supabase using the SERVICE ROLE key (server-side only,
-- never exposed to the frontend), which bypasses RLS by design. RLS is enabled
-- here anyway as defense-in-depth in case anon/public keys are ever used directly.
alter table users enable row level security;
alter table hackathons enable row level security;
alter table saved_hackathons enable row level security;

-- Hackathon listings are public read data (no policy needed for anon SELECT
-- since the app reads through the backend, but this keeps anon-key reads safe
-- if ever queried directly from the client):
create policy if not exists "Public read active hackathons" on hackathons
  for select using (is_expired = false);
