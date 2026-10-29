-- user_actions and analytics_events already exist in the deployed database but
-- are missing from the old base schema. Keep them, add the indexes their
-- duplicate-check queries need, and leave the counter functions untouched.
--
-- increment_views(hid) and increment_apply(hid) already exist. They are
-- intentionally NOT redefined here: routes/actions.js still calls them through
-- the anon client, and the existing functions grant EXECUTE to PUBLIC. Revoking
-- that now would break view/apply counting before that route moves to the
-- service-role client (Phase 2).

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

notify pgrst, 'reload schema';
