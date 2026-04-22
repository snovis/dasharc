# Walk: Synthflow Direct Implementation

Started: 2026-04-22 15:23 · Branch: synthflow-direct · Start commit: c1c35e0
Status: in progress
Totals: 16 items · 1 done · 0 rejected · 0 deferred · 0 modified · 15 unresolved

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

### 2. Set up Google OAuth Client ID — unresolved

**Recommendation**
Create an OAuth 2.0 client in Google Cloud Console for this deployment. Add authorized JavaScript origins for `http://localhost:5173` (Vite dev) and `http://localhost:3000` (vercel dev) now; add the production Vercel origin when we get there. Capture the resulting Client ID — it becomes `VITE_GOOGLE_CLIENT_ID`.

**Discussion**

**Resolution**

### 3. Add `google-auth-library` dependency — unresolved

**Recommendation**
In `package.json`: add `google-auth-library` (server-side Google ID token verification). Leave `firebase` in place for now — it becomes dead weight as we rewrite files that import from it, but we don't remove it until the Synthflow path is proven end-to-end (see final cleanup).

**Discussion**

**Resolution**

### 4. Create `api/_lib/verify-token.js` — unresolved

**Recommendation**
Shared helper (not an endpoint) that verifies a Google ID token against Google's JWKs, checks the audience matches our `GOOGLE_CLIENT_ID`, and asserts the caller's email is in `ALLOWED_EMAILS` (normalized lowercase). Underscore prefix on `_lib/` keeps Vercel from routing it as a public endpoint. Returns `{ email }` on success, throws on failure. All other `api/*` handlers call this first.

**Discussion**

**Resolution**

### 5. Create `api/agents.js` — unresolved

**Recommendation**
`GET /api/agents` — verify token, fetch agents for `AGENT_IDS` from Synthflow, return the filtered metadata list. This is what the dashboard uses to populate the agent picker / summary cards.

**Discussion**

**Resolution**

### 6. Create `api/calls.js` — unresolved

**Recommendation**
`GET /api/calls?agentId=X&fromDate=Y&toDate=Z` — verify token, verify `agentId` ∈ `AGENT_IDS`, proxy to Synthflow's `list-calls` with `model_id=agentId` and the date params, forward the response. Shape depends on item #1's findings.

**Discussion**

**Resolution**

### 7. Create `api/call.js` — unresolved

**Recommendation**
`GET /api/call?id=<callId>` — verify token, fetch single-call detail (transcript + recording URL) from Synthflow. Additionally verify the call belongs to an agent in `AGENT_IDS` to prevent callers pulling call data outside their allowed agent set.

**Discussion**

**Resolution**

### 8. Rewrite `src/pages/LoginPage.jsx` with Google GIS — unresolved

**Recommendation**
Replace the email/password form with a Google Sign-In button using the `google.accounts.id` browser library. On successful sign-in, hand the ID token to `useAuth` and route to the dashboard. Load the GIS script from `https://accounts.google.com/gsi/client` in `index.html` or via dynamic injection. Removes the last Firebase Auth imports from this file; `src/firebase/` still exists but becomes unreferenced.

**Discussion**

**Resolution**

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

## Summary

<!-- Written by /rsd:walk-done. Empty while the walk is in progress. -->
