# HackHub — Production hardening notes

## Error handling

`services/axiosClient.js` has a response interceptor that normalizes every failure (network drop, timeout, 4xx, 5xx) into `error.friendlyMessage`. `utils/errors.js#getErrorMessage()` reads that everywhere instead of each page re-deriving `err?.response?.data?.message` by hand.

## Loading states

Every data-fetching page (`HackathonList`, `HackathonDetails`, `Dashboard`, `Participants`) shows a skeleton while loading, an error+retry state on failure, and a distinct empty state when the request succeeds with zero results. Route-level chunks also show a `PageLoader` spinner while they download (see Code splitting below).

## Duplicate submissions

`ParticipateModal` and `SubmitModal` disable all inputs/buttons via `isSubmitting`, *and* hold a `submittingRef` lock so a fast double-click or Enter-key spam can't fire two requests. `Dashboard`'s organizer lookup has the same `if (loading) return` guard.

## Form edge cases

- `SubmitModal`'s URL field requires `http(s)://` explicitly (not just "any valid URI scheme"), plus a length cap.
- Start/end dates are validated for both format (`Number.isNaN` guard) and order (`end >= start`).
- All text fields are trimmed and length-capped before hitting the API.
- `HackathonList`'s **Participate** button was previously unwired (clicked, did nothing) — now opens `ParticipateModal` with the correct hackathon.

## Null date handling

`utils/date.js` is the single source of truth (`formatDateRange`, `safeFormatDate`, `isPastDate`). Every date-parsing call site (`HackathonCard`, `HackathonDetails`, `Timeline`) uses it instead of ad-hoc `new Date(...)` calls, so a missing or malformed date from the API renders "Date to be announced" / gets skipped instead of throwing or showing "Invalid Date".

## SEO meta tags

`components/Seo.jsx` (via `react-helmet-async`) sets a per-page `<title>`, description, canonical URL, and OpenGraph/Twitter tags. `HackathonDetails` builds its title/description dynamically from the fetched hackathon. `index.html` carries the same tags as a static fallback for crawlers that don't execute JS.

**Caveat**: this is a client-rendered SPA. Helmet updates the DOM after React runs, which Googlebot can index but many other crawlers/link-unfurlers can't. For guaranteed server-rendered meta tags, you'd need SSR (Next.js) or a prerendering step — worth planning for once SEO traffic actually matters.

## Code splitting / lazy loading

Every route in `App.jsx` is `React.lazy()`-loaded, so each page ships as its own chunk. `MainLayout` wraps only the `<Outlet/>` in `<Suspense>` (not the whole layout), so the navbar stays visible while a page chunk loads. `SubmitModal` and `ParticipateModal` (the two heaviest dependencies — React Hook Form + Zod) are also lazy — they're not mounted, and their chunk isn't fetched, until the user actually clicks the button that opens them.

## TypeScript (optional, not applied)

`src/types.js` adds JSDoc typedefs (`Hackathon`, `Participant`, etc.) plus a `jsconfig.json` with the `@/*` path alias, giving you autocomplete/type hints in-editor with zero build-step risk.

This intentionally stops short of a full `.jsx → .tsx` migration, since that needs a `tsconfig.json`, `typescript`/`@types/*` devDependencies, and a `tsc` pass to catch what it breaks — something worth doing deliberately with the ability to run the compiler, not blind. Say the word and a full migration can be done next.

## Setup

```bash
npm install
npm run dev
```

## Auth system (this pass)

**Session cookie, not localStorage** — `axiosClient.js` sets `withCredentials: true`. The backend must set an HTTP-only cookie on `/auth/login`, `/auth/signup`, and the Google OAuth callback, and clear it on `/auth/logout`. CORS must allow credentials with an explicit origin (not `*`) — see `.env.example`.

**Session bootstrap** — `context/AuthContext.jsx` calls `GET /auth/me` once on app load. If it succeeds, `user` is populated and the app treats you as logged in; if it fails (401, or no cookie), `user` stays `null` — silently, since a logged-out visitor on the homepage isn't an error.

**Protected routes** — `components/ProtectedRoute.jsx` wraps `/dashboard` and the participants page. It waits for the session bootstrap (`loading`) before deciding, then redirects to `/login` with the original destination in `location.state.from` so Login can send you back after signing in.

**Google OAuth** — `components/auth/GoogleAuthButton.jsx` does a full page redirect to `{VITE_API_URL}/auth/google`. The backend owns the rest (Google → callback → set cookie → redirect back). No frontend callback route is needed — the redirect lands back in the app, and `AuthContext`'s existing `/auth/me` check on load picks up the new session automatically.

**Forms** — `pages/Login.jsx` and `pages/Signup.jsx` use React Hook Form + Zod (same pattern as `ParticipateModal`/`SubmitModal`): email format, 6-char minimum password, confirm-password match via `.refine()`. Both disable inputs and show a spinner (`AuthSubmitButton`) while submitting, and hold a `submittingRef` lock against double-submits.

**Error format** — the backend's `{ success: false, message: "..." }` shape is already handled by the existing `axiosClient` interceptor + `getErrorMessage()`, so login/signup failures surface the exact backend message in a toast, no special-casing needed.

**Success flow** — toast fires immediately, then `setTimeout(..., 1000)` before navigating, matching "show toast → redirect after 1s".

**Design** — split layout (`components/auth/AuthLayout.jsx` + `AuthVisualPanel.jsx`): dark `#050505` background, floating animated hackathon cards on the left (desktop only), glass panel with the form on the right, `#7b39fc` as the accent (buttons reuse the app's existing gradient primary, which is already a close neon purple). On mobile the visual panel just disables (`hidden lg:block`), so the form stacks full-width and stays centered — normal login-page mobile UX, since a fixed sticky CTA over a password field would risk covering inputs when the keyboard opens.

**One deliberate integration point**: `Dashboard.jsx` now prefills the organizer email lookup with the logged-in user's email (`user?.email`) instead of always starting blank — small thing, but it's the natural payoff of wiring auth into a page that already asked for an email by hand.
