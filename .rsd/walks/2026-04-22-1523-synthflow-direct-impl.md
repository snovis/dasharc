# Walk: Synthflow Direct Implementation

Started: 2026-04-22 15:23 · Branch: synthflow-direct · Start commit: c1c35e0
Status: in progress
Totals: 16 items · 8 done · 0 rejected · 0 deferred · 0 modified · 8 unresolved

<!--
A walk is a living tasklist. Items are resolved one at a time via /rsd:next.
After each resolution, remaining items may be flagged for re-check if the fix
affected them. Flags are surfaced in chat and recorded inline, not auto-edited.
-->

## Items

### 1. Confirm Synthflow `list-calls` API shape — done

**Recommendation**
Curl `GET /v2/calls` with the real SalesARC API key to verify the request contract before designing the proxy endpoints. Need to confirm: `model_id` filter works as documented, date-range params are supported server-side (vs needing client-side pagination + filtering), and the response envelope shape for mapping into the chart components. This is the go/no-go gate for the whole pivot — if the API can't deliver, we rethink before deleting the Firebase baseline.

**Discussion**
Probed live against the OnSite Medical agent. All three sub-questions answered. Full findings saved to `.rsd/docs/2026-04-22-1631-synthflow-api-findings.md`. Highlights: `model_id` filter works; date filter works via `from_date`/`to_date` (YYYY-MM-DD, ISO, or epoch ms accepted — `to_date` is exclusive); offset pagination with `limit` max 100 and `total_records` returned; success envelope is `{status, response: {pagination, calls}}` and error envelope is `{detail: {status, description, request_id, category}}`; transcript is a flat string with `\nhuman: ... \nassistant: ...` format; `judge_results` is a ~35-field AI quality-scoring object that wasn't in the original dashboard scope — worth leveraging. Notable gotcha: unknown query params are silently ignored (caught when `start_date`/`end_date` returned the full 2849 unfiltered). Pivot is GO.

**Resolution**
done · API verified live; full shape + gotchas captured in the findings doc; proceed with implementation.

### 2. Set up Google OAuth Client ID — done

**Recommendation**
Create an OAuth 2.0 client in Google Cloud Console for this deployment. Add authorized JavaScript origins for `http://localhost:5173` (Vite dev) and `http://localhost:3000` (vercel dev) now; add the production Vercel origin when we get there. Capture the resulting Client ID — it becomes `VITE_GOOGLE_CLIENT_ID`.

**Discussion**
Scott created the OAuth client in Google Cloud Console and added `VITE_GOOGLE_CLIENT_ID` to `.env`. Verified shape: ends with `.apps.googleusercontent.com` as expected. Client secret was correctly not added — GIS ID-token flow doesn't use it. Production origin still needs to be added to the OAuth client's authorized origins when we deploy (tracked in item 16).

**Resolution**
done · OAuth client created, VITE_GOOGLE_CLIENT_ID in .env, suffix verified.

### 3. Add `google-auth-library` dependency — done

**Recommendation**
In `package.json`: add `google-auth-library` (server-side Google ID token verification). Leave `firebase` in place for now — it becomes dead weight as we rewrite files that import from it, but we don't remove it until the Synthflow path is proven end-to-end (see final cleanup).

**Discussion**
`npm install google-auth-library` added `^10.6.2` to `package.json` + 20 transitive packages. Clean install, no conflicts. `npm audit` flagged 4 vulnerabilities (1 critical, 2 high, 1 moderate) — none from google-auth-library itself: critical `protobufjs` is transitive from firebase (self-resolves at item 15); `brace-expansion` is via eslint (dev-only); `picomatch` is via vite's tinyglobby (dev-only); `vite` 8.0.1 has a dev-server path-traversal worth bumping later but not blocking. Deferred audit cleanup until after item 15.

**Resolution**
done · google-auth-library@^10.6.2 installed; no conflicts; audit warnings triaged (mostly self-resolve at item 15).

### 4. Create `api/_lib/verify-token.js` — done

**Recommendation**
Shared helper (not an endpoint) that verifies a Google ID token against Google's JWKs, checks the audience matches our `GOOGLE_CLIENT_ID`, and asserts the caller's email is in `ALLOWED_EMAILS` (normalized lowercase). Underscore prefix on `_lib/` keeps Vercel from routing it as a public endpoint. Returns `{ email }` on success, throws on failure. All other `api/*` handlers call this first.

**Discussion**
68-line ESM module committed at `6f24631`. Exports: `verifyRequest(req)` → `{ email, name, picture, sub }` or throws; `AuthError` class (carries `.status` 401/403/500); `handleAuthError(err, res)` convenience for catch blocks. Reads `VITE_GOOGLE_CLIENT_ID` server-side (one env var, Vercel functions see all env vars regardless of Vite prefix). Enforces `email_verified` from Google payload as defense-in-depth. Seeded `ALLOWED_EMAILS=scott@rymare.com,daniel@salesarcsolutions.com` in `.env`. Smoke-tested 3 failure paths (no header, Basic auth, bogus Bearer) — all throw AuthError with correct status codes. Happy path requires a real Google sign-in (validated by item 14 end-to-end smoke test).

**Resolution**
done · helper committed; failure paths verified; happy path deferred to item 14 smoke test.

### 5. Create `api/agents.js` — done

**Recommendation**
`GET /api/agents` — verify token, fetch agents for `AGENT_IDS` from Synthflow, return the filtered metadata list. This is what the dashboard uses to populate the agent picker / summary cards.

**Discussion**
67-line handler committed at `e9fbd74`. Key finding during probe: Synthflow's UI calls them "agents" but the API endpoint is `/v2/assistants` — analogous list vs single-ID pattern as `/v2/calls`. Handler fetches the full list once (agency has 5 assistants; limit=100 future-proofs), filters to `AGENT_IDS`, sanitizes. Strips: `agent.prompt` (8KB business logic with PII and campaign scripts), `external_webhook_url`, `inbound_call_webhook_url`, `consent_text`. Returns `{ agents: [...] }` — cleaner than forwarding Synthflow's envelope. Seeded `AGENT_IDS=0df733c4-a8fb-4d14-a12a-55fc62396bc7` (OnSite Medical only) in `.env`. Smoke-tested: POST→405, no auth→401, bogus token→401; full Synthflow fetch+filter+sanitize pipeline verified with real env (5 assistants → 1 filtered, 15KB → 2.8KB after sanitize).

**Resolution**
done · handler committed; Synthflow fetch+filter+sanitize verified; auth happy path deferred to item 14.

### 6. Create `api/calls.js` — done

**Recommendation**
`GET /api/calls?agentId=X&fromDate=Y&toDate=Z` — verify token, verify `agentId` ∈ `AGENT_IDS`, proxy to Synthflow's `list-calls` with `model_id=agentId` and the date params, forward the response. Shape depends on item #1's findings.

**Discussion**
92-line handler committed at `f6fdb73`. Client contract: camelCase query params (`agentId`, `fromDate`, `toDate`, `limit`, `offset`); proxy translates to Synthflow's snake_case. Auth allowlist: `agentId` must be in `AGENT_IDS`, else 403. `limit` clamped to [1, 100] (Synthflow max), default 100. **Inclusive-toDate magic:** pure `YYYY-MM-DD` inputs get +1 day before upstream call (Synthflow's `to_date` is exclusive); datetime inputs pass through unchanged. Strips `telephony_sip_headers` per design decision. Returns unwrapped `{ calls, pagination }` — drops Synthflow's `{status, response: {...}}` wrapper. Smoke-tested: POST→405; no auth→401; bogus token→401; date-bump helper handles year/month rollovers + datetime/epoch passthrough; live Synthflow pipeline verified — `fromDate=2026-04-20&toDate=2026-04-22` upstreams as `to_date=2026-04-23`, returns 1,032 records (matches item 1 probe exactly), sip_headers confirmed stripped.

**Resolution**
done · handler committed; full pipeline verified live; auth happy path deferred to item 14.

### 7. Create `api/call.js` — done

**Recommendation**
`GET /api/call?id=<callId>` — verify token, fetch single-call detail (transcript + recording URL) from Synthflow. Additionally verify the call belongs to an agent in `AGENT_IDS` to prevent callers pulling call data outside their allowed agent set.

**Discussion**
Resolved the prior flag by probing: correct endpoint is `GET /v2/calls/{call_id}` (same REST pattern as `/v2/assistants/{id}`). Returns `{status, response: {calls: [single]}}`. Single-call response has 25 fields vs list-calls' 33 — slightly trimmed but transcript + recording_url both present. Synthflow returns 404 for both bogus UUIDs and malformed IDs. 78-line handler committed at `7be1ffc`. Security decision: cross-agent calls return 404 (not 403) to avoid leaking existence of calls on other agents — verified live using a real call_id belonging to the Jessica agent (not in AGENT_IDS) and confirmed our handler 404s it even though Synthflow itself returned 200. `encodeURIComponent(id)` guards against URL injection. Strips `telephony_sip_headers` for consistency with list-calls handler. Returns unwrapped `{ call }`. Smoke-tested all failure paths + upstream pipeline (valid→200, bogus→404, cross-agent→404).

**Resolution**
done · endpoint probed + handler committed; cross-agent 404 verified live; auth happy path deferred to item 14.

### 8. Rewrite `src/pages/LoginPage.jsx` with Google GIS — done

**Recommendation**
Replace the email/password form with a Google Sign-In button using the `google.accounts.id` browser library. On successful sign-in, hand the ID token to `useAuth` and route to the dashboard. Load the GIS script from `https://accounts.google.com/gsi/client` in `index.html` or via dynamic injection. Removes the last Firebase Auth imports from this file; `src/firebase/` still exists but becomes unreferenced.

**Discussion**
Commit `38b682f` touched 7 files because LoginPage + useAuth are tightly coupled and Layout.jsx also imported from firebase/auth. Work done: (1) GIS script tag in `index.html`; (2) `appConfig.googleClientId` from `VITE_GOOGLE_CLIENT_ID`; (3) rewrote `useAuth.js`→`useAuth.jsx` as `AuthContext` + `AuthProvider` + `useAuth()` hook — decodes Google ID token for user info, persists in sessionStorage (survives reloads, auto-expires on `exp` claim), exposes signIn/signOut; (4) `<AuthProvider>` wraps routes in App.jsx; (5) LoginPage renders GIS button with graceful degradation when client-id missing or script fails to load; (6) Layout.jsx sign-out now uses `useAuth().signOut`. `npm run build` passes (643 modules). **All Firebase imports are gone from the active code path** — `src/firebase/` is now unreferenced dead code, ready for item 15. Interactive flow (button renders, sign-in completes, redirect) deferred to item 14 smoke test. The basics of item 9 (store token, expose signIn/signOut, drop Firebase refs) were absorbed into this commit — item 9 scope narrows to silent-refresh only.

**Resolution**
done · LoginPage + AuthContext shipped; build clean; Firebase unreferenced; interactive test deferred to item 14.

### 9. Rewrite `src/hooks/useAuth.js` — unresolved

**Recommendation**
Store the Google ID token (in-memory; optionally sessionStorage for refresh survivability). Expose `idToken`, `user` (email, name, picture from the JWT payload), `signIn`, `signOut`. Implement silent refresh before the 1hr expiry using GIS's auto-select / prompt flow so open dashboards don't suddenly 401. Drop all Firebase Auth references.

**Discussion**

**Resolution**

### 10. Rewrite `src/hooks/useCallData.js` — unresolved

**Recommendation**
Replace Firestore TODOs with `fetch('/api/...')` calls, including `Authorization: Bearer <idToken>` header. TanStack Query keys include agentId + date range. Set sensible `staleTime` (maybe 2–5 min) so users don't hammer Synthflow on every chart rerender.

**Discussion**

**Resolution**

### 11. Update charts + `AgentDetailPage.jsx` for Synthflow call shape — unresolved

**Recommendation**
Map Synthflow's call object fields (whatever #1 reveals) into the existing chart data structures. Update `AgentDetailPage.jsx` call log table columns to match Synthflow's available fields (timestamp, duration, status, transcript preview, recording link). Keep the UI shape; just change the sourcing.

**Discussion**

**Resolution**

### 12. Update `.env.example` — unresolved

**Recommendation**
Remove `VITE_FIREBASE_*` and `VITE_USE_MOCK_DATA`. Add: `VITE_GOOGLE_CLIENT_ID` (client-side, browser needs it), `SYNTHFLOW_API_KEY` (server-side only), `ALLOWED_EMAILS` (comma-separated), `AGENT_IDS` (comma-separated). Keep `VITE_COMPANY_NAME` / `VITE_APP_NAME`. Document the purpose of each in a comment above.

**Discussion**

**Resolution**

### 13. Update `CLAUDE.md` — unresolved

**Recommendation**
Rewrite the architecture section to reflect: no database, live Synthflow API proxy via Vercel functions, Google OAuth via GIS, env-var-driven allowlist + agent IDs. Remove references to Firestore, n8n, `VITE_USE_MOCK_DATA`. Update the "Data Flow" diagram. Keep the single-tenant cloneable section. Note that Firebase removal is pending the smoke test (final cleanup item).

**Discussion**

**Resolution**

### 14. Local smoke test with `vercel dev` — unresolved

**Recommendation**
Run `vercel dev` locally (proxies frontend + serverless functions on one port). Sign in with Google, verify email allowlist rejection works, load a real agent's calls, click through to a call detail page with transcript + recording. **This is the go/no-go gate.** Only after this passes do we delete the Firebase scaffolding.

**Discussion**

**Resolution**

### 15. Final cleanup: delete Firebase scaffolding — unresolved

**Recommendation**
After smoke test passes: delete `src/firebase/` (config.js, auth.js), `src/mock/callData.js`, `docs/FIRESTORE_SCHEMA.md`. Remove `firebase` from `package.json` dependencies, run `npm install` to prune lockfile. One cleanup commit. If anything breaks, `git revert` — we still have the branch's earlier state to fall back on.

**Discussion**

**Resolution**

### 16. Deploy first Vercel project — unresolved

**Recommendation**
Walk through: create Vercel project linked to the repo (production branch `main` — so we'll need to merge `synthflow-direct` → `main` first, or set production to `synthflow-direct` temporarily). Set all env vars (`VITE_GOOGLE_CLIENT_ID`, `SYNTHFLOW_API_KEY`, `ALLOWED_EMAILS`, `AGENT_IDS`, `VITE_COMPANY_NAME`, `VITE_APP_NAME`) in Vercel project settings. Add the production URL to the Google OAuth client's authorized origins. First deploy + smoke test.

**Discussion**

**Resolution**

## Flags

<!--
Amend-pass notes surface here when a resolution on one item affects another.
Format: `item N: why flagged · raised after item M resolved`.
Never auto-rewrites items; just a heads-up for when we get there.
-->

- item 7: `get-phone-call` single-call endpoint was NOT probed in item 1 — only `list-calls`. Before building `api/call.js`, need a quick curl against whatever Synthflow's single-call detail endpoint is (likely `GET /v2/calls/{call_id}`) to confirm the path and whether it returns the same call object shape or something richer. · raised after item 1 resolved
- item 11: Pagination cap is 100/request. Month-view on a ~100-calls/day agent = ~30 paginated requests. `useCallData` caching strategy + staleTime decisions should factor this in explicitly; may also want a "fetch all pages and aggregate" helper rather than pushing pagination to the UI. · raised after item 1 resolved
- item 12: Implementation now has concrete grounding: transcript is a plain string needing `\n(human|assistant):` split for chat-style UI; `call_status` buckets observed so far are `hangup_on_voicemail`, `no-answer`, `failed`, `completed`, `left_voicemail` (more may exist); `judge_results` (~35 AI-quality fields) is a dashboard opportunity not in the original spec — worth deciding whether to surface it in charts or reserve for the call detail page. · raised after item 1 resolved
- item 15: bonus upside — firebase removal also resolves the critical `protobufjs` CVE (transitive via `@firebase/firestore → @grpc/proto-loader`). After the cleanup, rerun `npm audit` and address any residual dev-only findings (picomatch, brace-expansion, vite bump). · raised after item 3 resolved
- item 9: scope narrowed. Item 8 already shipped the useAuth rewrite (context, sessionStorage persistence, signIn/signOut, Firebase references dropped). Only the **silent refresh before 1hr expiry** remains — hook into GIS auto-select or re-prompt flow so open dashboards don't 401 when the ID token expires. · raised after item 8 resolved
- item 15: `src/firebase/` is now fully unreferenced in the active code path (verified via grep after item 8). Safe to delete during final cleanup — no remaining `import` statements to break. · raised after item 8 resolved

## Summary

<!-- Written by /rsd:walk-done. Empty while the walk is in progress. -->
