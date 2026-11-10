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
  email_verified        boolean not null default false,
  email_verified_at     timestamptz,
  role                  text not null default 'user'
                          check (role in ('user', 'admin')),
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
-- EMAIL VERIFICATION OTPS
-- ============================================================
create table if not exists email_verification_otps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  otp_hash     text not null,
  attempts     integer not null default 0 check (attempts >= 0 and attempts <= 5),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists idx_email_verification_otps_one_active
  on email_verification_otps (user_id)
  where consumed_at is null;

create index if not exists idx_email_verification_otps_user_created
  on email_verification_otps (user_id, created_at desc);

-- ============================================================
-- PASSWORD RESET TOKENS
-- ============================================================
create table if not exists password_reset_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   text not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists idx_password_reset_tokens_token_hash
  on password_reset_tokens (token_hash);

create unique index if not exists idx_password_reset_tokens_one_active
  on password_reset_tokens (user_id)
  where used_at is null;

create index if not exists idx_password_reset_tokens_user_created
  on password_reset_tokens (user_id, created_at desc);

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
-- HACKATHON SUBMISSIONS (manual organizer submissions)
-- ============================================================
-- Pending submissions never enter public.hackathons. An admin approves or
-- rejects them here; approval copies the row into hackathons (status derived
-- from dates) and links the two via approved_hackathon_id.
create table if not exists public.hackathon_submissions (
  id                     uuid primary key default gen_random_uuid(),

  user_id                uuid references public.users (id) on delete set null,
  organizer_email        text not null,

  title                  text not null,
  url                    text not null,
  description            text not null default '',
  location               text not null default '',
  latitude               double precision,
  longitude              double precision,
  mode                   text not null default 'offline',

  start_date             timestamptz not null,
  end_date               timestamptz not null,

  status                 text not null default 'pending'
                           check (status in ('pending', 'approved', 'rejected')),
  review_note            text,
  reviewed_by            uuid references public.users (id) on delete set null,
  reviewed_at            timestamptz,
  approved_hackathon_id  uuid references public.hackathons (id) on delete set null,

  created_at             timestamptz not null default now(),

  constraint hackathon_submissions_date_order check (end_date >= start_date)
);

alter table public.hackathon_submissions enable row level security;

create index if not exists idx_hackathon_submissions_queue
  on public.hackathon_submissions (status, created_at desc);
create index if not exists idx_hackathon_submissions_user
  on public.hackathon_submissions (user_id, created_at desc);
create unique index if not exists idx_hackathon_submissions_one_pending_url
  on public.hackathon_submissions (user_id, url)
  where status = 'pending';

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
-- Email OTP helpers
-- ============================================================
create or replace function issue_email_verification_otp(
  p_user_id uuid,
  p_otp_hash text,
  p_expires_at timestamptz,
  p_resend_after_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked_user_id uuid;
  v_last_created_at timestamptz;
  v_wait_seconds integer;
  v_otp_id uuid;
begin
  select id into v_locked_user_id
  from users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'user_not_found');
  end if;

  select max(created_at) into v_last_created_at
  from email_verification_otps
  where user_id = p_user_id;

  if v_last_created_at is not null
     and v_last_created_at + make_interval(secs => p_resend_after_seconds) > now() then
    v_wait_seconds := ceil(
      extract(epoch from (v_last_created_at + make_interval(secs => p_resend_after_seconds) - now()))
    )::integer;

    return jsonb_build_object(
      'status', 'cooldown',
      'retry_after_seconds', greatest(v_wait_seconds, 1)
    );
  end if;

  update email_verification_otps
  set consumed_at = now()
  where user_id = p_user_id and consumed_at is null;

  insert into email_verification_otps (user_id, otp_hash, expires_at)
  values (p_user_id, p_otp_hash, p_expires_at)
  returning id into v_otp_id;

  return jsonb_build_object(
    'status', 'issued',
    'otp_id', v_otp_id,
    'expires_at', p_expires_at,
    'resend_after_seconds', p_resend_after_seconds
  );
end;
$$;

create or replace function verify_email_otp(
  p_user_id uuid,
  p_otp_hash text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked_user_id uuid;
  v_otp email_verification_otps%rowtype;
  v_new_attempts integer;
begin
  select id into v_locked_user_id
  from users
  where id = p_user_id
  for update;

  if not found then
    return 'not_found';
  end if;

  select * into v_otp
  from email_verification_otps
  where user_id = p_user_id and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return 'not_found';
  end if;

  if v_otp.expires_at <= now() then
    update email_verification_otps
    set consumed_at = now()
    where id = v_otp.id;

    return 'expired';
  end if;

  if v_otp.attempts >= 5 then
    update email_verification_otps
    set consumed_at = now()
    where id = v_otp.id;

    return 'attempts_exceeded';
  end if;

  if v_otp.otp_hash <> p_otp_hash then
    v_new_attempts := v_otp.attempts + 1;

    update email_verification_otps
    set attempts = v_new_attempts,
        consumed_at = case when v_new_attempts >= 5 then now() else consumed_at end
    where id = v_otp.id;

    if v_new_attempts >= 5 then
      return 'attempts_exceeded';
    end if;

    return 'invalid';
  end if;

  update email_verification_otps
  set consumed_at = now()
  where id = v_otp.id;

  update users
  set email_verified = true,
      email_verified_at = coalesce(email_verified_at, now())
  where id = p_user_id;

  return 'verified';
end;
$$;

create or replace function cleanup_email_verification_otps()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from email_verification_otps
  where expires_at < now() - interval '7 days'
     or (consumed_at is not null and consumed_at < now() - interval '7 days');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function issue_email_verification_otp(uuid, text, timestamptz, integer) from public;
revoke all on function verify_email_otp(uuid, text) from public;
revoke all on function cleanup_email_verification_otps() from public;
revoke all on function issue_email_verification_otp(uuid, text, timestamptz, integer) from anon, authenticated;
revoke all on function verify_email_otp(uuid, text) from anon, authenticated;
revoke all on function cleanup_email_verification_otps() from anon, authenticated;
grant execute on function issue_email_verification_otp(uuid, text, timestamptz, integer) to service_role;
grant execute on function verify_email_otp(uuid, text) to service_role;
grant execute on function cleanup_email_verification_otps() to service_role;

-- ============================================================
-- Password reset token helpers
-- ============================================================
create or replace function issue_password_reset_token(
  p_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_resend_after_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_locked_user_id uuid;
  v_last_created_at timestamptz;
  v_wait_seconds integer;
  v_token_id uuid;
begin
  select id into v_locked_user_id
  from users
  where id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'user_not_found');
  end if;

  select max(created_at) into v_last_created_at
  from password_reset_tokens
  where user_id = p_user_id;

  if v_last_created_at is not null
     and v_last_created_at + make_interval(secs => p_resend_after_seconds) > now() then
    v_wait_seconds := ceil(
      extract(epoch from (v_last_created_at + make_interval(secs => p_resend_after_seconds) - now()))
    )::integer;

    return jsonb_build_object(
      'status', 'cooldown',
      'retry_after_seconds', greatest(v_wait_seconds, 1)
    );
  end if;

  update password_reset_tokens
  set used_at = now()
  where user_id = p_user_id and used_at is null;

  insert into password_reset_tokens (user_id, token_hash, expires_at)
  values (p_user_id, p_token_hash, p_expires_at)
  returning id into v_token_id;

  return jsonb_build_object(
    'status', 'issued',
    'token_id', v_token_id,
    'expires_at', p_expires_at
  );
end;
$$;

create or replace function consume_password_reset_token(
  p_token_hash text,
  p_password_hash text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token password_reset_tokens%rowtype;
begin
  select * into v_token
  from password_reset_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_token.used_at is not null then
    return 'used';
  end if;

  if v_token.expires_at <= now() then
    return 'expired';
  end if;

  update users
  set password = p_password_hash
  where id = v_token.user_id;

  if not found then
    return 'invalid';
  end if;

  update password_reset_tokens
  set used_at = now()
  where user_id = v_token.user_id and used_at is null;

  return 'reset';
end;
$$;

create or replace function cleanup_password_reset_tokens()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from password_reset_tokens
  where expires_at < now() - interval '7 days'
     or (used_at is not null and used_at < now() - interval '7 days');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function issue_password_reset_token(uuid, text, timestamptz, integer) from public;
revoke all on function consume_password_reset_token(text, text) from public;
revoke all on function cleanup_password_reset_tokens() from public;
revoke all on function issue_password_reset_token(uuid, text, timestamptz, integer) from anon, authenticated;
revoke all on function consume_password_reset_token(text, text) from anon, authenticated;
revoke all on function cleanup_password_reset_tokens() from anon, authenticated;
grant execute on function issue_password_reset_token(uuid, text, timestamptz, integer) to service_role;
grant execute on function consume_password_reset_token(text, text) to service_role;
grant execute on function cleanup_password_reset_tokens() to service_role;

-- ============================================================
-- Row Level Security
-- ============================================================
-- The backend talks to Supabase with the service-role key, which bypasses RLS
-- by design. RLS is enabled as defense-in-depth so a leaked anon key cannot
-- read or write these tables directly.
alter table public.users enable row level security;
alter table public.email_verification_otps enable row level security;
alter table public.password_reset_tokens enable row level security;
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
