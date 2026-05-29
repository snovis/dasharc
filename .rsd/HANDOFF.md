# Handoff

Written: 2026-05-29 14:15 · Context used: ~50%
Branch: multi-tenant · Last commit: 38753f2

## What we're working on

Maintaining/extending the multi-tenant DashARC dashboard live on the rymare.com DigitalOcean droplet. This session: added two client users, rewrote CLAUDE.md for the droplet topology, shipped persistent cookie-based auth, and fixed the call-detail blank-fields bug. All on branch `multi-tenant` (PR #2), pushed.

Slice: per-user multi-tenant config in `/etc/dasharc/accounts.yaml` (gitignored on droplet); Express API at 127.0.0.1:4100 behind nginx; deploy = `ssh rymare`, `git pull` + restart (+ `npm run build` for frontend changes).

## What just happened

<!-- verified outcomes only -->
- Added `dan@oneteam360.com` + `dave@oneteam360.com` (scoped to `onboard-360` only) to the droplet's `/etc/dasharc/accounts.yaml`; restart loaded "2 accounts, 12 users" (verified via `/api/health` + journalctl). Backup at `/etc/dasharc/accounts.yaml.bak-20260528-183945`.
- Shipped server-issued **httpOnly session cookie auth** (replaces sessionStorage). Verified on prod HTTPS: no-auth → 401, valid minted cookie → 200, logout clears cookie. Scott confirmed he stayed logged in after reopening the URL.
- Fixed **call-detail blank Lead/Phone + "Other" pill**: normalized `/api/call` in `server/routes/call.js` (`name`→`lead_name`, `phone_number_to/from`→`lead_phone_number`, `status`→`call_status`). Verified prod HTTPS returns "Jason Lujan" / real phone / "failed".
- Rewrote `CLAUDE.md` for the droplet/Express/multi-tenant topology (dual Google+Microsoft auth via `jose`, YAML config, cookie session). Added `.claude/skills/add-dashboard-user/` skill (safe prod user-add runbook).
- `npm run build` + `npm run lint` clean (no NEW errors; 2 pre-existing lint errors untouched). All committed + pushed; latest commit 38753f2.

## What's open

- **judge_results not shown on call detail.** Synthflow's `v2/calls/{id}` omits `judge_results` (only the list `v2/calls` carries it — 35 keys on connected/voicemail calls; `failed` calls legitimately have none). Detail page never gets it.
- Plan written verbatim in `.rsd/docs/2026-05-29-1414-judge-results-plan.md`: enrich `/api/call` server-side via a **date-scoped list lookup** (use the single call's `model_id` + `start_time` date → query `v2/calls` for that day → find by `call_id` → merge `judge_results`), with graceful fallback. ~30–45 min, server-only.
- Next likely action: **awaiting Scott's go-ahead** to implement that enrichment, then deploy (pull + restart).

## Recent decisions

<!-- provisional -->
- 2026-05-29: Auth = server-issued HS256 session cookie (httpOnly, SameSite=Lax, 30d default; `SESSION_SECRET` required at boot, set in `/etc/dasharc/env`). Bearer ID token kept as bootstrap/fallback. Why: sessionStorage didn't persist across tabs/restarts and the provider token expired ~1h.
- 2026-05-29: Call-detail field mismatch fixed **server-side** (normalize in `call.js`), not in the frontend. Why: single source of truth — both call-log and detail pages read the same field names.
- 2026-05-28: `dan`/`dave` scoped to `onboard-360` **only** (Scott emphatic: "AND NOTHING ELSE") — cross-tenant data isolation.

## Open threads (not current focus)

- Legacy Vercel `api/` dir + Vercel project still in tree as a rollback path (decom = task 9, pending Scott's confidence in the droplet).
- Lint was already failing on HEAD before this session (pre-existing `react-hooks/refs` in `useCallData.js` + `react-refresh/only-export-components` in `useAuth.jsx`) — not introduced here, left untouched.
- `firebase` package + `src/firebase/` + `src/mock/` still present as old transitional dead code (CLAUDE.md "Transitional / Dead Code").
