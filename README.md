# HackHub — AI-powered hackathon discovery

HackHub crawls Devpost, Unstop, and college pages, ranks results per-user with a local/cloud LLM
(Ollama), and pushes daily email/WhatsApp digests. See `ARCHITECTURE.md` for the full system design,
trade-offs, and scaling notes.

## Quick start (local dev)

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `backend/sql/schema.sql` — this creates the `users`,
   `hackathons`, `saved_hackathons`, and `email_verification_otps` tables, indexes,
   full-text search, and the helper functions used by discovery and email verification.
3. Run each file in `backend/sql/migrations/` in filename order. Existing databases need
   `20261102_add_email_verification.sql` for OTP verification and verified-organizer
   submission checks.
4. Grab your `SUPABASE_URL` and `service_role` key from **Settings → API**.

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JWT secret, Ollama URL, etc.
npm install
npm run dev            # starts API on :5000 + cron scheduler
```

Run the crawler once manually to seed data:

```bash
npm run crawl
```

Ollama (for AI ranking) needs to be running locally:

```bash
ollama serve
ollama pull llama3
```

If Ollama is unreachable, `aiService.js` automatically falls back to a deterministic heuristic
ranking — the product stays usable, just less "smart," instead of erroring out.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:5000` (see `vite.config.js`).

## Environment variables

See `backend/.env.example` for the full list: Supabase URL/service key, JWT secret, OTP hashing
secret, Ollama endpoint/model, Google Maps key, SMTP creds, Twilio creds, and cron expressions.

Email signup verification requires `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS`; `SMTP_PORT`
defaults to 587. Set a dedicated `OTP_HASH_SECRET`; if it is omitted, the backend falls
back to `JWT_SECRET`.

## Deployment

| Layer     | Target                          |
|-----------|----------------------------------|
| Frontend  | Vercel (`frontend/`, framework: Vite) |
| Backend   | Render or Railway (`backend/`, `npm start`) |
| Database  | Supabase (Postgres)               |
| AI        | Local Ollama in dev; a GPU-backed Ollama instance (or hosted inference) in prod — set `OLLAMA_BASE_URL` accordingly |

Set `CLIENT_URL` on the backend to your deployed frontend origin (for CORS), and
`VITE_API_BASE_URL` on the frontend to your deployed backend's `/api` URL.

`TRUST_PROXY_HOPS` defaults to `1` in production, which matches the single proxy
Render/Railway put in front of the API. Set it to `0` if the backend is reachable
directly, otherwise rate limiting buckets every request under the proxy's IP.

## What's stubbed vs. production-ready

- **Auth, models, rate limiting, geo filtering, AI ranking with fallback, notification
  pipeline, cron scheduler** — implemented and wired end-to-end.
- **Runtime decision engine** (`utils/strategyEngine.js`) — this is what was genuinely still
  missing after the API integration work: `fetchFromApi()` + the scraping chain existed, but
  nothing *decided* anything — every run blindly tried API → selectors → structural → Puppeteer →
  AI in the same fixed order regardless of what happened last time. That's reactive fallback
  switching, not a proactive decision. `decideStrategy(source, { apiConfigured })` is now called
  at the top of both `devpostCrawler.js` and `unstopCrawler.js`, and actively decides whether the
  API layer is worth attempting *this run* based on real outcome history (skips it automatically
  after `STRATEGY_API_FAILURE_THRESHOLD` consecutive failures, resumes trying it again the moment
  it succeeds once). `recordOutcome()` is called after every layer (API or scraping) so the next
  decision has real data. State is inspectable at `GET /api/ops/crawler-strategy` — per-source last
  successful strategy, consecutive failure counts, and the last 10 outcomes — so "the system is
  deciding" is verifiable, not just asserted. Verified with a network-free simulation
  (`decideStrategy`/`recordOutcome` called directly, no HTTP involved): after 3 simulated API
  failures the engine correctly stopped recommending the API layer, then correctly resumed after a
  simulated success — this sandbox has no network access, so a live call against a real endpoint
  couldn't be demonstrated here, but the decision *logic* itself is confirmed working.
- **API integration, response parsing, and runtime fallback switching** — the previous API
  detector only alerted "this might be usable"; it never actually fetched or used anything.
  `utils/apiCrawler.js` closes that gap for real: `fetchFromApi(config)` calls a configured
  endpoint (with the same retry/timeout/rate-control as everything else) and parses its response
  into our normalized hackathon shape using a declarative field-mapping config (dot-paths, or a
  function per field for anything needing real logic). `fetchFromApiWithFallback(configs)` tries a
  *list* of configs in order — API→API fallback, not just API→scraping. Both
  `devpostCrawler.js`/`unstopCrawler.js` now try their API config as **Layer 0**, before any HTML
  scraping — if it returns enough results, scraping is skipped entirely for that run; if it fails,
  isn't configured, or comes back thin, execution falls through to the existing selector →
  structural → Puppeteer → AI chain with zero special-casing needed. **Status:** both endpoints are
  verified against the live sites. Devpost's `?status=open` narrows 14,207 listings to ~48 open
  ones (two pages at the 40-per-page cap); Unstop pages 20 at a time and its finished events are
  filtered client-side because it ignores status/region/sort params. The API path is therefore on
  by default — set `DEVPOST_API_ENABLED=false` or `UNSTOP_API_ENABLED=false` to force HTML
  scraping. `decideStrategy()` still skips the API after `STRATEGY_API_FAILURE_THRESHOLD`
  consecutive failures, and a result set below `CRAWLER_*_MIN_RESULTS` is compared against the
  scrape instead of replacing it. Known gap: `organizer` and `prizePool` are parsed but have no
  columns in `hackathons` yet, so `upsertHackathon()` drops them — that needs a migration.
- **Strict timeout handling** — three real gaps closed: `geocodeCity()` had no request timeout at
  all (an unresponsive Maps API could hang a whole crawl run — now capped by `GEOCODE_TIMEOUT_MS`);
  each source crawler (Devpost/Unstop/College) now has a hard wall-clock cap
  (`CRAWLER_SOURCE_TIMEOUT_MS`, `utils/timeout.js`) so a hang anywhere in that source's pipeline
  can't stall the whole run indefinitely; Puppeteer renders have both their own navigation timeout
  *and* an outer hard timeout (`PUPPETEER_HARD_TIMEOUT_MS`). **Caveat, stated plainly:**
  `withTimeout()` races a promise against a clock — it does not cancel/kill the underlying work, so
  a timed-out crawler keeps running in the background until it naturally finishes or errors; true
  cancellation would need an `AbortController` threaded through the whole call chain, which is a
  larger change than what's here.
- **Resource optimization** — `geocodeCity()` results are now cached per city (`node-cache`, 30-day
  TTL) instead of hitting the paid Google Maps API for every hackathon that shares a city.
  Puppeteer no longer launches a fresh Chromium process per render call *and per retry attempt* —
  `utils/browserPool.js` keeps one shared browser alive for the process's lifetime, opening/closing
  only a lightweight page per attempt, and it's released (`closeSharedBrowser()`) at the end of
  every crawl run and on server shutdown (`SIGTERM`/`SIGINT` handling added to `server.js`, so
  redeploys on Render/Railway don't leak a Chromium process or cut off in-flight requests).
- **Retry, batching, and rate control** — three gaps that existed even after the layered-defense
  work: (1) retry previously only covered the initial HTML fetch; `utils/retry.js` now wraps DB
  upserts, Puppeteer renders, Ollama calls, and alert sends too. (2) Alerts previously fired
  individually the instant an issue was detected; `services/alertBatcher.js` now queues them and
  sends one consolidated message per crawl run, with a per-issue cooldown (`ALERT_COOLDOWN_MS`) so
  a recurring break doesn't re-alert every single run. (3) There was no rate control between
  requests to the same host (e.g. a static fetch immediately followed by a Puppeteer re-render of
  the same URL); `utils/rateLimiter.js` enforces a minimum interval per host
  (`CRAWLER_MIN_HOST_INTERVAL_MS`), wired into both `fetchWithRetry` and `renderWithPuppeteer`.
- **Ops alerting** — `services/alertService.js` sends Telegram + email alerts (independent
  channels, either can fail without blocking the other) whenever the anomaly detector fires or a
  source crawler throws outright. Configure `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` and/or
  `OPS_ALERT_EMAIL` — both are optional and skip silently (never crash the crawler) if unset.
- **Puppeteer fallback** — now wired directly into both `devpostCrawler.js` and
  `unstopCrawler.js`: if the static fetch + selector layers come back thin, a headless-browser
  re-render is tried automatically before falling back further to AI extraction. Requires
  `npm install puppeteer` (already in `package.json` — it's a heavy dependency, ships a Chromium
  binary, so expect a larger `node_modules`).
- **API detection** — `utils/apiDetector.js` probes a small set of candidate API URLs weekly (see
  `API_DETECTION_CRON`) and sends an ops alert if one looks usable. **Honest caveat:** the
  candidate URLs are educated guesses, not confirmed documented APIs — treat a hit as "worth
  manually investigating," not "safe to wire up immediately." Run `node utils/apiDetector.js`
  standalone any time to check without waiting for the weekly schedule.
- **Layered selector defense** — Devpost/Unstop crawlers now try several container selectors and
  keep whichever matches the most elements (`utils/resilientSelect.js`), fall back to a
  class-agnostic href-pattern scan if that comes back thin, and can optionally fall back further
  to AI-based extraction via Ollama (`services/aiFallbackParser.js`, off by default —
  `CRAWLER_AI_FALLBACK_ENABLED=true` to enable). `utils/anomalyDetection.js` flags when a source
  returns suspiciously few results, which is what triggers the fallback chain.
- **Crawler resilience layer** — retry-with-backoff (`utils/httpClient.js`), a shared validation
  gate (`utils/validate.js`) that drops malformed listings before they reach the DB, structured
  logging (`utils/logger.js`), and in-run deduplication in the orchestrator (on top of the
  cross-run `dedupe_hash` DB constraint) are all wired in. One source failing outright
  (`Promise.allSettled`) or one listing card being malformed never takes down the whole run.
- **Crawler selectors** (Devpost/Unstop) — real scraping logic is in place, but source sites
  change their DOM periodically; selectors should be verified against the live markup before
  a production run, and Puppeteer fallback is included for JS-rendered pages.
- **College crawler** — generic and config-driven (`COLLEGE_SOURCES` in `collegeCrawler.js`);
  add real college event pages there.
- **Trending score** — currently increments on save (via an atomic Postgres function); a real
  version would blend saves, views, and recency decay.
- **Row Level Security** — enabled on all tables in `schema.sql` as defense-in-depth, but the
  backend uses the Supabase **service role** key (bypasses RLS) since Express is the trusted
  gatekeeper. If you ever query Supabase directly from the frontend, write proper RLS policies
  first — don't rely on the ones sketched in the schema file as-is.
