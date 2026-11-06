# HackHub Agent Guide

Start every task from this repository root. Trust executable config and source over prose:
some README claims are stale (notably the Vite `/api` proxy and frontend env names).

## Fast navigation

- `README.md` — setup, deployment notes, and operational status.
- `ARCHITECTURE.md` — system design, crawler flow, data ownership, and trade-offs.
- `backend/` — Express API, crawlers, scheduled jobs, Supabase repositories, notifications.
- `frontend/` — Vite/React UI. The `@/` alias maps to `frontend/src`.
- `backend/sql/schema.sql` — base Supabase schema (includes auth/OTP/password-reset objects).
- `backend/sql/migrations/` — run in filename order after the base schema.
- `backend/tests/` — `node:test` suites; no live Supabase or SMTP required.
- `backend/.env.example` and `frontend/.env.example` — required keys; never commit real secrets.

## Commands and quirks

- Backend dev: `cd backend && npm run dev` (API on `:5000`, starts cron scheduler).
- Backend tests: `cd backend && npm test` (`node --test tests/*.test.js`). There is no root test script.
- Backend syntax check: `node --check <file>` for changed `.js` files. JSX must be checked via the frontend build.
- Frontend dev/build: `cd frontend && npm run dev` / `npm run build`.
- There are no lint or typecheck scripts in either package; do not invent them.
- SQL migrations are manual (Supabase SQL editor or `supabase db push`); the server and tests never apply them.
- Frontend calls `VITE_API_URL` directly (default `http://localhost:5000/api`). `vite.config.js` has no `/api` proxy, and `frontend/.env.example` currently shows `:4000`; align it with the backend `PORT`.

## Auth and data invariants

- Auth is custom Express + bcrypt + JWT, stored in the `hackhub_session` HTTP-only cookie. Do not replace it with Supabase Auth.
- New signups are unverified and get an OTP from `email_verification_otps`. Login is allowed, but the UI redirects unverified users to `/verify-email`; `requireVerifiedEmail` gates hackathon submission.
- Password reset is deliberately separate: `password_reset_tokens` stores only HMAC token hashes, one active token per user, 30-minute TTL. `consume_password_reset_token` atomically consumes the token and updates only `users.password`.
- A password reset must never set `email_verified`/`email_verified_at` and must not reuse or modify the OTP tables/functions.
- `POST /api/auth/forgot-password` must never reveal whether an account exists: unknown and existing emails get the same generic success response.
- Reset email URLs use `PASSWORD_RESET_BASE_URL`, falling back to `CLIENT_URL`. Token hashes use `PASSWORD_RESET_TOKEN_SECRET`, falling back to `OTP_HASH_SECRET`, then `JWT_SECRET`.
- Keep auth endpoints behind the limiters in `backend/middleware/rateLimit.js`; reuse `authLimiter`/OTP/reset limiters rather than adding ad-hoc throttling.
- `backend/config/supabase.js` throws at import if Supabase env vars are missing. `server.js` loads dotenv; tests must set fake env values before dynamically importing route/repo modules. Never import `server.js` in tests (it starts listening and schedules cron).

## Test conventions

- `backend/tests/otpService.test.js` and `passwordReset.test.js` use pure service cores with in-memory fakes and mock email senders; do not send real email or hit Supabase.
- `passwordReset.test.js` imports the dependency-free helper `frontend/src/utils/passwordReset.js`; keep that helper free of imports so backend tests can load it.
- There is no frontend test runner. Verify frontend changes with `npm run build`; verify browser behavior manually.

## Non-negotiable checks

1. Preserve unrelated uncommitted work.
2. Keep API responses camelCase and database fields snake_case through repository mappers.
3. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, JWT secrets, Telegram tokens, SMTP passwords, or Twilio credentials.
4. For any schema change, add an ordered SQL migration and update the base schema or setup documentation when needed.
5. Run `node --check` on changed backend JavaScript, `cd backend && npm test`, and `cd frontend && npm run build` when the environment permits.

## Telegram alert behavior

Telegram is an operations-alert channel, not a user digest channel. Alerts are queued,
deduplicated, and flushed as a summary after crawler/API-check runs. Required production
variables are `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
