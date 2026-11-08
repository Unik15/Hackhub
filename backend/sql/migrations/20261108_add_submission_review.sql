-- ============================================================
-- SUBMISSION REVIEW: users.role + hackathon_submissions
-- ============================================================
-- Organizer-submitted hackathons used to be written straight into
-- public.hackathons with status = 'pending' — a state nothing could ever
-- leave, because no review path existed. They now live in their own table
-- with a real lifecycle (pending -> approved | rejected), and only approved
-- submissions are copied into public.hackathons for public discovery.
--
-- Run this file in the Supabase SQL editor. It is idempotent enough to be
-- re-run safely on the same database.

-- ------------------------------------------------------------
-- 1. users.role — 'admin' unlocks the review queue
-- ------------------------------------------------------------
alter table public.users
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_role_check'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_role_check check (role in ('user', 'admin'));
  end if;
end
$$;

-- ------------------------------------------------------------
-- 2. hackathon_submissions — every manual submission, forever
-- ------------------------------------------------------------
create table if not exists public.hackathon_submissions (
  id                     uuid primary key default gen_random_uuid(),

  -- Nullable so submissions made before accounts existed can be backfilled
  -- without losing history; new submissions always carry the submitter.
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

  -- Set when approved: the public listing this submission became.
  approved_hackathon_id  uuid references public.hackathons (id) on delete set null,

  created_at             timestamptz not null default now(),

  constraint hackathon_submissions_date_order check (end_date >= start_date)
);

-- Service-role only: the queue is never exposed publicly. Same pattern as
-- user_actions/analytics_events — RLS on, deliberately no policies.
alter table public.hackathon_submissions enable row level security;

create index if not exists idx_hackathon_submissions_queue
  on public.hackathon_submissions (status, created_at desc);
create index if not exists idx_hackathon_submissions_user
  on public.hackathon_submissions (user_id, created_at desc);

-- One pending submission per user+URL stops queue spam without blocking a
-- resubmission after a rejection.
create unique index if not exists idx_hackathon_submissions_one_pending_url
  on public.hackathon_submissions (user_id, url)
  where status = 'pending';

-- ------------------------------------------------------------
-- 3. Backfill manual rows that were written to hackathons
-- ------------------------------------------------------------
-- Rows that were already public (expired/active/upcoming) become 'approved'
-- submissions linked to the listing they created. Rows still stuck at
-- 'pending' become pending submissions and are removed from hackathons below.
insert into public.hackathon_submissions (
  user_id,
  organizer_email,
  title,
  url,
  description,
  location,
  latitude,
  longitude,
  mode,
  start_date,
  end_date,
  status,
  approved_hackathon_id,
  created_at
)
select
  u.id,
  h.organizer_email,
  h.title,
  h.url,
  coalesce(h.description, ''),
  coalesce(h.location, ''),
  h.latitude,
  h.longitude,
  case when h.mode = 'online' then 'online' else 'offline' end,
  h.start_date,
  h.end_date,
  case when h.status = 'pending' then 'pending' else 'approved' end,
  case when h.status = 'pending' then null else h.id end,
  h.created_at
from public.hackathons h
left join public.users u
  on lower(u.email) = lower(h.organizer_email)
where h.platform = 'manual'
  and h.organizer_email is not null
  and h.start_date is not null
  and h.end_date is not null
  and not exists (
    select 1
    from public.hackathon_submissions s
    where s.url = h.url
      and s.organizer_email = h.organizer_email
  );

-- Pending submissions are not public listings; they live in the new table
-- now, so remove the stuck rows from hackathons.
delete from public.hackathons
where platform = 'manual'
  and status = 'pending';
