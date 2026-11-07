-- Email OTP verification for new HackHub accounts.
-- Safe to run after schema.sql and the earlier migrations.
--
-- Existing accounts are grandfathered as verified so the new verification gate
-- does not lock out users who registered before this feature existed. New
-- accounts default to unverified.

alter table users
  add column if not exists email_verified boolean,
  add column if not exists email_verified_at timestamptz;

update users
set email_verified = true
where email_verified is null;

update users
set email_verified_at = coalesce(email_verified_at, created_at)
where email_verified = true and email_verified_at is null;

alter table users alter column email_verified set default false;
alter table users alter column email_verified set not null;

create table if not exists email_verification_otps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  otp_hash     text not null,
  attempts     integer not null default 0 check (attempts >= 0 and attempts <= 5),
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- Only one active OTP may exist per user. Older codes are invalidated by the
-- issuance function, and this index closes the gap for concurrent requests.
create unique index if not exists idx_email_verification_otps_one_active
  on email_verification_otps (user_id)
  where consumed_at is null;

create index if not exists idx_email_verification_otps_user_created
  on email_verification_otps (user_id, created_at desc);

alter table email_verification_otps enable row level security;

-- Atomically issues a new OTP, invalidates the previous one, and enforces the
-- resend cooldown. Locking the user row serializes concurrent requests.
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

-- Atomically verifies an OTP, enforces expiry and the five-attempt limit,
-- consumes the code exactly once, and marks the email verified. The user row is
-- locked first so concurrent verify/issue calls cannot race on the same OTP.
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

-- Housekeeping: retain recent audit rows, but purge old consumed/expired codes.
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
