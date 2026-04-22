# Synthflow Direct — Design Specification

Written: 2026-04-22 15:03 · Context at save: (unknown)
Branch: synthflow-direct · Commit: 0ac9817

## Content

## The stripped-down design

**Stack:** Vite + React + Tailwind + Recharts + TanStack Query (all existing) + Vercel serverless functions.

**Auth:** Google Sign-In via Google's browser library (GIS). User clicks "Sign in with Google," Google hands the browser a JWT ID token. We verify that token on every `/api/*` call using Google's public keys. Stateless — no session database.

**Config, all via env vars — no database at all:**
- `ALLOWED_EMAILS` — comma-separated list of who can log in
- `AGENT_IDS` — comma-separated Synthflow agent IDs this deployment surfaces
- `SYNTHFLOW_API_KEY` — server-side only
- `GOOGLE_CLIENT_ID` — for OAuth

**Deploy model:** one Vercel project per client. Each client's deployment has their emails and their agent IDs. Matches the original "single-tenant, cloneable" intent from CLAUDE.md.

**Data:** live proxy only. `/api/calls?agentId=X&fromDate=Y&toDate=Z` → Vercel function verifies the Google ID token, checks the caller's email is in `ALLOWED_EMAILS`, checks the agentId is in `AGENT_IDS`, calls Synthflow, forwards. That's it.

**What goes away:** Firebase entirely. Firestore. The `authorized_users/{email}` collection idea. The `ingest` function. The Firestore schema doc.

## Concrete change inventory

**Delete:**
- `src/firebase/` directory (config.js, auth.js)
- `firebase` from `package.json` dependencies
- `docs/FIRESTORE_SCHEMA.md` (obsolete — no Firestore anymore)

**Add:**
- Google OAuth via `google.accounts.id` browser library in LoginPage
- `api/verify-token.js` (shared helper) — verifies Google ID token against Google's JWKs on every API call
- `api/agents.js` — `GET` — returns Synthflow agent metadata filtered to this deployment's `AGENT_IDS`
- `api/calls.js` — `GET` — proxies to Synthflow's list-calls with `model_id`, date filters
- `api/call.js` — `GET` — proxies Synthflow's get-phone-call (single call detail with transcript + recording)
- `google-auth-library` dependency (for the server-side JWT verification)

**Modify:**
- `src/pages/LoginPage.jsx` — replace email/password form with Google sign-in button
- `src/hooks/useAuth.js` — rewrite to store the Google ID token and pass it to API calls
- `src/hooks/useCallData.js` — replace Firestore TODOs with `fetch('/api/...')` calls with `Authorization: Bearer <google-id-token>` header
- `src/mock/callData.js` — reshape to match Synthflow's call object structure (or just drop and rely on a live Synthflow key in dev)
- `src/pages/AgentDetailPage.jsx` + chart components — work mostly as-is, just sourcing from Synthflow

**Update:**
- `.env.example` — remove `VITE_FIREBASE_*` and `VITE_USE_MOCK_DATA`, add `GOOGLE_CLIENT_ID`, `ALLOWED_EMAILS`, `AGENT_IDS`, `SYNTHFLOW_API_KEY`
- `CLAUDE.md` — update architecture section

## Mock mode resolution

**Dropped.** Local dev will require `SYNTHFLOW_API_KEY` in `.env`. SalesARC's key works fine for dev. `src/mock/callData.js` and `VITE_USE_MOCK_DATA` env var both removed.

## Key design decisions captured along the way

1. **Clients partitioned by agent IDs, not subaccounts.** SalesARC's agency Synthflow account uses agent naming convention (`<Client> - <Purpose>`) rather than native subaccounts. Confirmed example IDs: OnSite Medical - Dispatch Enrollment = `0df733c4-a8fb-4d14-a12a-55fc62396bc7`, SalesArc - Jessica - Outbound = `48db7b13-e38d-48fe-93ba-d4a0a8f7e05b`.

2. **Freshness: live on page load.** No sync job, no caching in a database. Each dashboard render fires Synthflow API calls. Acceptable for a reporting tool. Synthflow outage = dashboard down (acceptable trade-off).

3. **No multi-tenancy in the app itself.** Single-tenant cloneable — one Vercel deployment per client, their config in their env vars. Matches original CLAUDE.md intent.

4. **No database at all.** Allowlist and agent list are env-var config; sessions are stateless JWTs; call data is live-proxied. Simplest possible architecture for a one-off reporting GUI.

5. **Synthflow API key is a server-side secret.** Never reaches the browser. All Synthflow calls go through `/api/*` Vercel functions that proxy on the caller's behalf.
