-- Stores a user's registration for a hackathon. The backend's service role is
-- the only actor permitted to access this personally identifiable information.
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

alter table public.participants enable row level security;
