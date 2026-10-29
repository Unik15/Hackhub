-- hackathonRepo.createSubmittedHackathon inserts platform = 'manual', and the
-- crawler normalizer falls back to platform = 'unknown'. Neither value exists
-- in the deployed platform_enum, so both writes fail with 22P02
-- (invalid input value for enum) even after the hackathon columns are added.
--
-- Kept as its own migration because ALTER TYPE ... ADD VALUE cannot be used in
-- the same transaction that starts using the new value.

do $$
begin
  if exists (select 1 from pg_type where typname = 'platform_enum') then
    execute 'alter type platform_enum add value if not exists ''manual''';
    execute 'alter type platform_enum add value if not exists ''unknown''';
  end if;
end
$$;

notify pgrst, 'reload schema';
