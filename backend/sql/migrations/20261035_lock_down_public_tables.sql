-- Lock down the public tables now that every backend route reaches Supabase
-- with the service-role key.
--
-- Before this migration:
--   * hackathons had RLS disabled, so the anon key could read, update and
--     delete listings (Supabase advisor: "RLS disabled in public.hackathons")
--   * user_actions and analytics_events had RLS enabled with zero policies,
--     which blocked the anon-key inserts routes/*.js used to make
--   * increment_views/increment_apply were executable by PUBLIC
--
-- routes/actions.js and routes/analytics.js used createUserClient() plus
-- supabase.auth.getUser(), which never matches this app's custom JWT. Both now
-- use the admin client and optionalAuth, so RLS can stay enabled everywhere.

-- ============================================================
-- hackathons: public read of live listings, nothing else
-- ============================================================
alter table public.hackathons enable row level security;

drop policy if exists "Public read live hackathons" on public.hackathons;
create policy "Public read live hackathons" on public.hackathons
  for select
  to anon, authenticated
  using (status in ('upcoming', 'active'));

-- ============================================================
-- Engagement tables: service role only (no policies on purpose)
-- ============================================================
alter table public.user_actions enable row level security;
alter table public.analytics_events enable row level security;

-- ============================================================
-- Missing foreign key
-- ============================================================
-- user_actions was created without the user_id FK, so orphaned ids could be
-- written. Safe to add here: the column is nullable and no orphan rows exist.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_actions'::regclass
      and conname = 'user_actions_user_id_fkey'
  ) then
    alter table public.user_actions
      add constraint user_actions_user_id_fkey
      foreign key (user_id) references public.users (id) on delete set null;
  end if;
end
$$;

-- ============================================================
-- Counter RPCs: backend only
-- ============================================================
-- These are SECURITY DEFINER, so PUBLIC execute let anyone holding the anon key
-- inflate views_count/apply_count (and therefore trending_score) directly.
revoke all on function public.increment_views(uuid) from public;
revoke all on function public.increment_apply(uuid) from public;
revoke all on function public.increment_views(uuid) from anon, authenticated;
revoke all on function public.increment_apply(uuid) from anon, authenticated;

grant execute on function public.increment_views(uuid) to service_role;
grant execute on function public.increment_apply(uuid) to service_role;

notify pgrst, 'reload schema';
