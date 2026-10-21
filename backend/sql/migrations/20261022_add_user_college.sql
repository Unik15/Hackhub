-- Signup collects college/organization; persist it on existing installations.
alter table users
  add column if not exists college text;
