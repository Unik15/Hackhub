-- Organizer submissions are inserted with status = 'pending'
-- (see hackathonRepo.createSubmittedHackathon). The deployed table uses the
-- hackathon_status enum, which only allows upcoming/active/expired.
--
-- Kept separate from the column migration because ALTER TYPE ... ADD VALUE
-- cannot be used in the same transaction that adds the new value.

do $$
begin
  if exists (select 1 from pg_type where typname = 'hackathon_status') then
    execute 'alter type hackathon_status add value if not exists ''pending''';
  end if;
end
$$;

notify pgrst, 'reload schema';
