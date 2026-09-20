# HackHub — Architecture

## 1. System overview

```
                          ┌─────────────────────┐
                          │   Crawlers (cron)    │
                          │ Devpost / Unstop /   │
                          │ College sites        │
                          └──────────┬───────────┘
                                     │ normalize + dedupe (hash)
                                     ▼
                          ┌─────────────────────┐
                          │  Supabase (Postgres) │
                          │ hackathons / users   │
                          └──────────┬───────────┘
                                     │
                 ┌───────────────────┼────────────────────┐
                 ▼                   ▼                    ▼
       ┌──────────────┐   ┌────────────────────┐  ┌────────────────┐
       │  REST API     │   │  AI Ranking Layer   │  │  Notifications  │
       │ Express + JWT │──▶│ Ollama (llama3) +   │  │ Email + WhatsApp│
       │               │   │ geo filter + cache  │  │ (daily cron)    │
       └──────┬────────┘   └────────────────────┘  └────────────────┘
              │
              ▼
       ┌──────────────┐
       │ React + Vite  │
       │ Tailwind UI   │
       └──────────────┘
```

## 2. Why Supabase (Postgres) instead of MongoDB

Hackathon and user data here is genuinely relational — a user has many saved hackathons, a
hackathon has many savers — which `saved_hackathons` models as a plain join table instead of an
array-of-IDs field. Postgres's built-in full-text search (`tsvector` + GIN index) also covers the
search/filter use case without a separate search service. Supabase specifically gives instant
REST/JS-client access to that Postgres instance plus a hosted dashboard for inspecting data,
without having to stand up Postgres infrastructure by hand.

**Security model:** the Express backend authenticates to Supabase with the **service role key**
(server-side only, set via `SUPABASE_SERVICE_ROLE_KEY`), which bypasses Row Level Security by
design — Express's own JWT auth + `express-validator` checks are the actual gatekeeper here, the
same way they would be in front of any database. RLS is still enabled on every table in
`sql/schema.sql` as defense-in-depth, in case a key with lower privileges (e.g. the anon/public key)
is ever used to query Supabase directly from a client.

## 3. Why these choices

**Dedupe by content hash, not just URL.** The same hackathon often appears on both Devpost and a
college's own page with different links. `hackathonRepo.buildDedupeHash()` hashes normalized title +
source + link, stored in a `unique` Postgres column (`dedupe_hash`) — source is included
deliberately so the *same* event from two *different* sources isn't collapsed into one (you want
both, they're not true duplicates), while re-crawls of the same source hit Postgres's
`ON CONFLICT (dedupe_hash) DO UPDATE` (via Supabase's `.upsert()`) and update the existing row
instead of creating a new one.

**AI ranking is cached and has a deterministic fallback.** LLM calls are the slowest, most
failure-prone part of the stack. `aiService.js` caches by a hash of (user profile + candidate ID
set) for 6 hours, and if Ollama is unreachable or returns unparseable output, it falls back to a
heuristic ranking (skill/tag overlap + distance + deadline urgency) rather than surfacing an error
to the user. This means a GPU outage degrades relevance, not availability.

**Geo filtering happens before the LLM call, not after.** Sending all candidates to the LLM and
asking it to also handle distance wastes tokens and lets the model's math be the least reliable
part of a numeric constraint. `geoService.js` does the Haversine filtering in code (cheap, exact),
and only the already-filtered nearby + guaranteed-online set goes to the model for the fuzzier
judgment calls (skill match quality, deadline urgency framing, overall "worth it" scoring).

**Strict JSON contract with the LLM.** The prompt requests `format: "json"` (Ollama's structured
output mode) and the parser strips code fences / finds the outer `[...]` defensively, since models
occasionally ignore "no preamble" instructions. This is standard practice for any LLM-in-the-loop
system where a downstream service parses the output programmatically.

**Rate limiting is tiered.** General API traffic gets a loose limit; auth endpoints get a tight
limit (blunts credential stuffing); the AI recommendation endpoint gets the tightest limit, keyed
per-user, since each call can trigger an LLM inference and Google Maps API request — the two most
expensive and quota-limited dependencies in the stack.

## 4. Data flow: getting a recommendation

1. User logs in → JWT stored client-side, attached via Axios interceptor.
2. `GET /api/recommendations` loads the user, pulls up to 200 non-expired candidate hackathons
   (optionally pre-filtered by preferred mode).
3. `filterByProximity()` splits candidates into "within 500km" and "online," keeping at least one
   online result even if none are geographically nearby.
4. `rankHackathonsForUser()` checks cache, else prompts Ollama, else falls back to heuristic
   ranking.
5. Route enriches the AI's slim `{id, title, score, reason}` output with `link`/`mode`/`distanceKm`
   pulled back from the filtered candidate set (keeps the LLM prompt small — it never needs to
   echo back fields it isn't reasoning about).

## 5. Crawler resilience

- Each crawler (`devpostCrawler.js`, `unstopCrawler.js`, `collegeCrawler.js`) fails independently —
  `Promise.allSettled` in `crawlers/index.js` means one source's selector breaking, or even
  throwing outright, doesn't block the others from returning their results.
- **Retry with backoff** (`utils/httpClient.js`): network blips and `429`/`5xx` responses are
  retried up to `CRAWLER_MAX_RETRIES` times with exponential backoff; a `4xx` (other than 429)
  fails fast since retrying a bad request wastes time without helping.
- **Validation gate** (`utils/validate.js`): every raw listing is checked for a non-empty title
  and a resolvable absolute URL before it's allowed further into the pipeline — a selector that
  silently starts matching the wrong element produces an empty string, not a crash, so this catches
  what a try/catch alone wouldn't.
- **Per-item try/catch**: one malformed card in a 50-card listing page doesn't abort parsing the
  other 49.
- **In-run dedup** (`crawlers/index.js`): the same listing occasionally appears twice within a
  single page (pagination overlap, a "featured" card repeating). `dedupeWithinRun()` hashes each
  normalized item and drops repeats *before* geocoding or hitting the DB — the `dedupe_hash`
  unique constraint in Postgres remains the source of truth across separate runs, this is purely
  an optimization within one run.
- Per-item upserts are wrapped individually so one malformed listing doesn't abort the whole run.
- `collegeCrawler.js` is config-driven (`COLLEGE_SOURCES` array of `{url, itemSelector,
  titleSelector, linkSelector, dateSelector}`), so onboarding a new college is a data change, not a
  code change, and adds a politeness delay (`CRAWLER_SOURCE_DELAY_MS`) between hitting different
  institutional domains.
- A Puppeteer fallback is included for Unstop in case the static HTML stops containing listing
  data (client-side rendered pages need a headless browser to execute JS first).

## 6. Notifications

`notificationService.js` sends both email (Nodemailer/SMTP) and WhatsApp (Twilio) from the same
digest payload, gated per-user by `notificationPrefs`. The daily cron (`scheduler/cron.js`, 8am)
reuses the exact same geo-filter + AI-rank pipeline as the live "Recommended for YOU" endpoint, so
what a user sees in their inbox always matches what they'd see if they opened the app that moment.

## 7. Frontend design direction

Visual concept: **a radar sweeping for signals other people miss** — directly reflects the product's
core value prop (surfacing hackathons that aren't already all over your feed). The hero's radar
rings + rotating conic-gradient sweep + fading "blips" are the signature element; everything else
(cards, forms, nav) stays disciplined and quiet around it — a dark ink background, one cyan
"scan" accent for primary actions/AI signals, and a warm amber "signal" accent reserved
specifically for urgency (closing deadlines), so color carries meaning rather than decoration.
Space Grotesk (display) + Inter (body) + JetBrains Mono (scores, distances, countdowns — anything
that reads as live data) reinforce the "instrument panel" feel without tipping into a generic
sci-fi HUD pastiche.

## 8. Scaling notes (for when this needs to handle real load)

- **Crawlers → separate worker process.** Currently the scheduler runs in-process with the API
  server for simplicity. At scale, move `runCrawlers()` to a standalone worker (e.g. a separate
  Render/Railway service or a queue consumer) so a slow crawl never competes with API request
  handling for CPU/event-loop time.
- **AI layer → dedicated inference service.** Ollama should run on its own GPU-backed instance in
  production, called over HTTP from the API layer exactly as it is in dev — only `OLLAMA_BASE_URL`
  changes. Consider a request queue in front of it if concurrent recommendation requests spike.
- **Postgres indexes already in place** (see `sql/schema.sql`): a GIN index on the generated
  `search_vector` column (title/description/tags) for fast full-text search, plus indexes on
  `is_expired` and `trending_score` for the hot query paths (active listings, trending feed).
  Proximity filtering currently runs in the app layer (Haversine over a bounded candidate set,
  capped at 200–300 rows per request) rather than as a DB-level geo query — if the table grows
  large enough that this becomes a bottleneck, enabling the PostGIS extension and switching
  `latitude`/`longitude` to a `geography` column with a GiST index would push that filtering into
  Postgres itself.
- **Cache layer:** `node-cache` (in-memory) is fine for a single instance; move to Redis once the
  API runs on more than one node, so AI-response caching and rate-limit counters stay consistent
  across instances.
