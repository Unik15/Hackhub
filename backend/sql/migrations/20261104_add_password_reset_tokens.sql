-- Secure, single-use password reset tokens for HackHub accounts.
-- Safe to run after schema.sql and 20261102_add_email_verification.sql.
--
-- Tokens are generated in the API with crypto.randomBytes and only their
-- keyed hash is persisted here. Resetting a password never changes
-- email_verified/email_verified_at, so the existing verification gate stays
-- intact.

create table if not exists password_reset_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   text not null,
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- A token hash must be globally unique so one link can never map to two rows.
create unique index if not exists idx_password_reset_tokens_token_hash
  on password_reset_tokens (token_hash);

-- At most one active reset token per user. Issuance consumes older tokens
-- inside the same transaction so this also closes the concurrent-request gap.
create unique index if not exists idx_password_reset_tokens_one_active
  on password_reset_tokens (user_id)
  where used_at is null;

create index if not exists idx_password_reset_tokens_user_created
  on password_reset_tokens (user_id, created_at desc);

alter table password_reset_tokens enable row level security;

-- Atomically issues a reset token, invalidates any previous active token, and
-- applies a per-account resend cooldown. Locking the user row serializes
-- concurrent issuance for the same account.
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

-- Atomically verifies, consumes, and applies a reset token. The token row is
-- locked first so concurrent submissions of the same link cannot both update
-- the password. Successful resets invalidate every other active token for the
-- user, and only the password column is touched.
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

-- Housekeeping: retain recent rows for audit, purge old consumed/expired ones.
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
