-- Align the deployed hackathons table with backend/repositories/hackathonRepo.js.
--
-- The deployed table predates the current API schema and is missing columns
-- that LIST_COLUMNS selects. PostgREST reports the missing `mode` column as
--   "WITHIN GROUP is required for ordered-set aggregate mode"
-- because it resolves the unknown field to PostgreSQL's mode() aggregate,
-- which is why the error text looks unrelated to the real problem.
--
-- Additive and safe to re-run.

alter table hackathons
  add column if not exists mode text,
  add column if not exists domain text[] not null default '{}',
  add column if not exists tags text[] not null default '{}',
  add column if not exists registration_deadline timestamptz,
  add column if not exists organizer_email text;

-- Backfill the new column from the existing boolean before enforcing the API contract.
update hackathons
set mode = case when coalesce(is_online, true) then 'online' else 'offline' end
where mode is null;

alter table hackathons alter column mode set default 'online';
alter table hackathons alter column mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'hackathons'::regclass
      and conname = 'hackathons_mode_check'
  ) then
    alter table hackathons
      add constraint hackathons_mode_check
      check (mode in ('online', 'offline', 'hybrid'));
  end if;
end
$$;

create index if not exists idx_hackathons_mode on hackathons (mode);

-- Make the new columns visible to PostgREST without waiting for a restart.
notify pgrst, 'reload schema';
