-- Records the organizer contact for listings submitted through the public form.
-- Pending submissions remain hidden from public discovery until reviewed.

alter table hackathons
  add column if not exists organizer_email text;

create index if not exists idx_hackathons_pending_submissions
  on hackathons (created_at desc)
  where status = 'pending';
