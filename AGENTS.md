# HackHub Agent Guide

Start every task from this repository root. Do not search outside the paths below
until these project entry points have been checked.

## Fast navigation

- `README.md` — setup, deployment notes, and operational status.
- `ARCHITECTURE.md` — system design, crawler flow, data ownership, and trade-offs.
- `backend/` — Express API, crawlers, scheduled jobs, Supabase repositories, and notifications.
- `frontend/` — Vite/React user interface.
- `backend/sql/schema.sql` — base Supabase schema.
- `backend/sql/migrations/` — run in filename order after the base schema.
- `backend/.env.example` and `frontend/.env.example` — required configuration keys; never commit real secrets.

## Work routing

- API/auth/data issue: inspect `backend/routes/`, `backend/repositories/`, then `backend/middleware/`.
- Crawler, Telegram, email, WhatsApp, or scheduled job: inspect `backend/crawlers/`, `backend/services/`, and `backend/scheduler/`.
- Location discovery: inspect `backend/services/geoService.js`, `backend/routes/hackathons.js`, migrations, and `frontend/src/pages/HackathonList.jsx`.
- UI issue: inspect `frontend/src/pages/`, then `frontend/src/components/` and `frontend/src/services/`.
- Deployment issue: inspect both `.env.example` files, `backend/server.js`, and the deployment section in `README.md`.

## Non-negotiable checks

1. Preserve unrelated uncommitted work.
2. Keep API responses camelCase and database fields snake_case through repository mappers.
3. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, JWT secrets, Telegram tokens, SMTP passwords, or Twilio credentials.
4. For any schema change, add an ordered SQL migration and update the base schema or setup documentation when needed.
5. Validate changed backend JavaScript with `node --check`; build the frontend when the environment permits.

## Telegram alert behavior

Telegram is an operations-alert channel, not a user digest channel. Alerts are queued,
deduplicated, and flushed as a summary after crawler/API-check runs. Required production
variables are `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
