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
  email_verified        boolean not null default false,
  email_verified_at     timestamptz,
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
-- The backend talks to Supabase using the SERVICE ROLE key (server-side only,
-- never exposed to the frontend), which bypasses RLS by design. RLS is enabled
-- here anyway as defense-in-depth in case anon/public keys are ever used directly.
alter table users enable row level security;
alter table email_verification_otps enable row level security;
alter table password_reset_tokens enable row level security;
alter table hackathons enable row level security;
alter table saved_hackathons enable row level security;

-- Hackathon listings are public read data (no policy needed for anon SELECT
-- since the app reads through the backend, but this keeps anon-key reads safe
-- if ever queried directly from the client):
create policy if not exists "Public read active hackathons" on hackathons
  for select using (is_expired = false);
