-- The API integration parses prize pools and organizer names out of both
-- verified endpoints (Devpost's prize_amount / organization_name, Unstop's
-- overall_prizes / organisation.name), but the table had no columns for
-- them, so upsertHackathon() silently dropped both on every crawl.
--
-- Additive and idempotent: safe to run twice. Not NULL/NOT NULL-guarded on
-- purpose — scraped listings legitimately lack either field.
alter table public.hackathons
  add column if not exists organizer text,
  add column if not exists prize_pool text;
