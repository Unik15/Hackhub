-- HackHub — base schema for Supabase (Postgres)
--
-- Reconstructed from the deployed project shape (column types, enums, triggers
-- and functions verified against the live database) so a fresh Supabase project
-- matches what backend/repositories/* actually reads and writes.
--
-- Run this once in the Supabase SQL editor before starting the backend.
-- For an existing database, do NOT run this file — use the ordered files in
-- sql/migrations/ instead.

create extension if not exists pgcrypto;

-- ============================================================
-- ENUMS
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_enum') then
    create type public.platform_enum as enum (
      'devpost', 'unstop', 'mlh', 'hack2skill', 'hackindia', 'college',
      'reskilll', 'manual', 'unknown'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'hackathon_status') then
    create type public.hackathon_status as enum (
      'upcoming', 'active', 'expired', 'pending'
    );
  end if;
end
$$;

-- ============================================================
-- USERS
-- ============================================================
-- Custom-JWT auth: the backend owns identity, so there is deliberately no
-- foreign key to auth.users here.
create table if not exists public.users (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  email                 text not null,
  password              text, -- bcrypt hash; null only for future OAuth-only accounts
  phone                 text,
  college               text,

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

  -- Legacy columns kept so a Supabase Auth trigger can still write them.
  full_name             text,
  avatar_url            text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists users_email_lower_key
  on public.users (lower(email));

-- ============================================================
-- HACKATHONS
-- ============================================================
create table if not exists public.hackathons (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text not null default '',
  url                     text not null,
  dedupe_hash             text not null unique, -- sha256(title|platform|url)

  platform                public.platform_enum not null,
  source_name             text,
  source_url              text,

  location                text not null default '',
  latitude                double precision,
  longitude               double precision,
  is_online               boolean not null default true,
  mode                    text not null default 'online'
                            check (mode in ('online', 'offline', 'hybrid')),

  domain                  text[] not null default '{}',
  tags                    text[] not null default '{}',

  start_date              timestamptz,
  end_date                timestamptz,
  registration_deadline   timestamptz,

  organizer               text,
  prize_pool              text,

  status                  public.hackathon_status not null default 'upcoming',
  trending_score          integer not null default 0,
  views_count             integer not null default 0,
  apply_count             integer not null default 0,

  organizer_email         text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_hackathons_status
  on public.hackathons (status);
create index if not exists idx_hackathons_platform
  on public.hackathons (platform);
create index if not exists idx_hackathons_mode
  on public.hackathons (mode);
create index if not exists idx_hackathons_start_date
  on public.hackathons (start_date);
create index if not exists idx_hackathons_trending
  on public.hackathons (trending_score desc, created_at desc);
create index if not exists idx_hackathons_domain
  on public.hackathons using gin (domain);
create index if not exists idx_hackathons_tags
  on public.hackathons using gin (tags);

-- ============================================================
-- SAVED HACKATHONS (many-to-many join table)
-- ============================================================
create table if not exists public.saved_hackathons (
  user_id       uuid not null references public.users (id) on delete cascade,
  hackathon_id  uuid not null references public.hackathons (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, hackathon_id)
);

create index if not exists idx_saved_hackathons_hackathon
  on public.saved_hackathons (hackathon_id);

-- ============================================================
-- PARTICIPANTS
-- ============================================================
create table if not exists public.participants (
  id            uuid primary key default gen_random_uuid(),
  hackathon_id  uuid not null references public.hackathons (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 180),
  college       text not null check (char_length(college) between 1 and 150),
  created_at    timestamptz not null default now()
);

create unique index if not exists participants_hackathon_email_lower_key
  on public.participants (hackathon_id, lower(email));
create index if not exists idx_participants_hackathon_created
  on public.participants (hackathon_id, created_at desc);

-- ============================================================
-- ENGAGEMENT / ANALYTICS
-- ============================================================
create table if not exists public.user_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references public.users (id) on delete set null,
  hackathon_id  uuid references public.hackathons (id) on delete cascade,
  action_type   text check (action_type in ('view', 'apply', 'click')),
  created_at    timestamptz not null default now(),
  metadata      jsonb
);

create index if not exists idx_user_actions_lookup
  on public.user_actions (hackathon_id, action_type, created_at desc);
create index if not exists idx_user_actions_user
  on public.user_actions (user_id);

create table if not exists public.analytics_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users (id) on delete set null,
  event_type  text not null check (event_type in (
                'page_view', 'login', 'logout', 'signup', 'button_click',
                'search', 'hackathon_view', 'hackathon_apply', 'profile_update'
              )),
  page        text,
  metadata    jsonb check (pg_column_size(metadata) < 10000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_analytics_events_lookup
  on public.analytics_events (event_type, page, created_at desc);
create index if not exists idx_analytics_events_user
  on public.analytics_events (user_id);

-- ============================================================
-- updated_at TRIGGER
-- ============================================================
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_user_timestamp on public.users;
create trigger update_user_timestamp
  before update on public.users
  for each row execute function public.update_updated_at();

-- ============================================================
-- DERIVED TRENDING SCORE
-- ============================================================
-- trending_score is computed on every hackathon UPDATE: views and applies
-- dominate, with a recency boost so new listings get a chance to surface.
create or replace function public.update_trending_score()
returns trigger language plpgsql as $$
begin
  new.trending_score =
    (
      coalesce(new.views_count, 0) * 1 +
      coalesce(new.apply_count, 0) * 5
    )
    +
    (
      1000 / (1 + extract(epoch from (now() - new.created_at)) / 3600)
    );

  return new;
end;
$$;

drop trigger if exists trg_trending on public.hackathons;
create trigger trg_trending
  before update on public.hackathons
  for each row execute function public.update_trending_score();

-- ============================================================
-- ATOMIC COUNTER INCREMENTS
-- ============================================================
-- SECURITY DEFINER so anon-key callers can bump counters without direct
-- UPDATE access to hackathons.
create or replace function public.increment_views(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.hackathons
     set views_count = coalesce(views_count, 0) + 1
   where id = hid;
end;
$$;

create or replace function public.increment_apply(hid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.hackathons
     set apply_count = coalesce(apply_count, 0) + 1
   where id = hid;
end;
$$;

revoke all on function public.increment_views(uuid) from public;
revoke all on function public.increment_apply(uuid) from public;

grant execute on function public.increment_views(uuid) to service_role;
grant execute on function public.increment_apply(uuid) to service_role;

-- ============================================================
-- Row Level Security
-- ============================================================
-- The backend talks to Supabase with the service-role key, which bypasses RLS
-- by design. RLS is enabled as defense-in-depth so a leaked anon key cannot
-- read or write these tables directly.
alter table public.users enable row level security;
alter table public.hackathons enable row level security;
alter table public.saved_hackathons enable row level security;
alter table public.participants enable row level security;
alter table public.user_actions enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "Public read live hackathons" on public.hackathons;
create policy "Public read live hackathons" on public.hackathons
  for select
  to anon, authenticated
  using (status in ('upcoming', 'active'));

-- users, saved_hackathons, user_actions and analytics_events intentionally have
-- no policies: only the service role may touch them.
