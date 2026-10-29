-- Align the deployed users table with backend/repositories/userRepo.js.
--
-- The deployed users table was built for Supabase Auth: it only has
-- id/email/full_name/avatar_url/created_at/updated_at, and users.id carries a
-- validated foreign key to auth.users(id). This app authenticates with its own
-- JWT and creates the user row directly, so that FK makes every signup fail
-- with 23503 (foreign key violation).
--
-- Additive, plus one constraint drop. Safe to re-run.

alter table public.users
  add column if not exists name text,
  add column if not exists password text,
  add column if not exists phone text,
  add column if not exists college text,
  add column if not exists skills text[] not null default '{}',
  add column if not exists experience text,
  add column if not exists interests text[] not null default '{}',
  add column if not exists city text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists preferred_mode text,
  add column if not exists notify_email boolean not null default true,
  add column if not exists notify_whatsapp boolean not null default false,
  add column if not exists notify_daily_digest boolean not null default true;

-- Custom-JWT signup owns the primary key; auth.users is not the identity source.
alter table public.users drop constraint if exists users_id_fkey;

-- Backfill name from the legacy full_name column when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'full_name'
  ) then
    execute 'update public.users set name = full_name where name is null';
  end if;
end
$$;

update public.users set name = split_part(email, '@', 1) where name is null;
update public.users set experience = 'beginner' where experience is null;
update public.users set preferred_mode = 'both' where preferred_mode is null;

alter table public.users alter column name set not null;
alter table public.users alter column experience set default 'beginner';
alter table public.users alter column experience set not null;
alter table public.users alter column preferred_mode set default 'both';
alter table public.users alter column preferred_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_experience_check'
  ) then
    alter table public.users add constraint users_experience_check
      check (experience in ('beginner', 'intermediate', 'advanced'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.users'::regclass and conname = 'users_preferred_mode_check'
  ) then
    alter table public.users add constraint users_preferred_mode_check
      check (preferred_mode in ('online', 'offline', 'both'));
  end if;
end
$$;

-- Case-insensitive uniqueness so createUser() can rely on 23505.
create unique index if not exists users_email_lower_key
  on public.users (lower(email));

-- Missing table — save/unsave currently fails with PGRST205.
create table if not exists public.saved_hackathons (
  user_id      uuid not null references public.users (id) on delete cascade,
  hackathon_id uuid not null references public.hackathons (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, hackathon_id)
);

create index if not exists idx_saved_hackathons_hackathon
  on public.saved_hackathons (hackathon_id);

-- Service role bypasses RLS; this only blocks direct anon access.
alter table public.users enable row level security;
alter table public.saved_hackathons enable row level security;

notify pgrst, 'reload schema';
