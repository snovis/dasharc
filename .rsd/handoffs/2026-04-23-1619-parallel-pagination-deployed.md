# Handoff

Written: 2026-04-23 14:28 · Context used: ~46%
Branch: main · Last commit: dd27e19

## What we're working on

DashARC is live in production at `https://dasharc-local.vercel.app`. Daniel's using it and loves the UI, but first-load is slow (5-8s) because `useCalls` walks Synthflow pagination sequentially. Scott floated reintroducing Firebase as a cache layer; I recommended trying parallel pagination first before committing to new infrastructure.

## What just happened

- Completed and closed `.rsd/walks/2026-04-22-1523-synthflow-direct-impl.md` — 14 done, 2 deferred, 0 unresolved. Summary block written. `.rsd/walks/ACTIVE` removed.
- Fast-forward merged `synthflow-direct` → `main`; deployed to Vercel production (`dasharc-local` project), set 6 env vars, added prod origin to the Google OAuth client. Scott + Daniel both signed in successfully.
- Surfaced load-time pain during the 2026-04-23 demo share with Daniel. Root cause identified: `fetchAllCalls` in `src/hooks/useCallData.js` walks pages serially (~500ms × ~10 pages for 1k records).
- Drafted three-option analysis for the perf problem; pushed back on the Firebase-as-cache instinct in favor of cheaper options first. No code changes yet.

## What's open

- No active walk. Last walk closed at `dd27e19`.
- Open: decide the perf fix before starting the next walk. Three options ranked cheapest first:
  - **A. Parallel pagination** (~30 min): refactor `fetchAllCalls` in `src/hooks/useCallData.js` to fire pages 2..N in parallel after page 1 returns `pagination.total_records`. Expected ~5-8× speedup. No state, no infrastructure.
  - **B. Edge caching on Vercel** (~1hr): add `Cache-Control: s-maxage=120` to `/api/calls` responses in `api/calls.js`. Helps repeat loads only.
  - **C. Firebase-as-cache** (Scott's original idea, 1-2 days): re-introduces the thing we just ripped out. Adds cache-invalidation, sync job, new infra. Only reach for this if A+B aren't enough.
- Reproduce/check by: visit `https://dasharc-local.vercel.app`, sign in, observe ~5-8s first-load in Network tab showing ~10 sequential `/api/calls` requests.
- Next likely action: start a tiny walk for Option A (or just implement it directly — it's small). Leave B and C on the shelf unless A's benefit is insufficient.

## Recent decisions

- 2026-04-23: Deferred Firebase-as-cache pending a cheaper perf attempt (parallel pagination). Reasoning captured in the closed walk's Summary block + this handoff. If A+B together hit sub-second first-load and <100ms repeat, C is unnecessary.
- 2026-04-22: Kept the `dasharc-local` Vercel project name for production (originally created as a throwaway during `vercel dev` link) rather than creating a fresh one. Cosmetic; can rename later via Vercel dashboard.
- 2026-04-22: Fast-forward merge (no merge commit) for `synthflow-direct` → `main`. Clean history since main was a direct ancestor.

## Open threads (not current focus)

- Item 9 (deferred): silent Google ID token refresh before 1-hour JWT expiry. Users with stale sessions get a generic API error on their next action and must reload to re-sign-in. Fix scope: schedule a `google.accounts.id.prompt()` call N minutes before `exp` from the JWT, feed the fresh token back through `useAuth().signIn`. 30-60 LOC plus edge cases.
- Item 15 (deferred): delete dead `src/firebase/`, `src/mock/callData.js`, `docs/FIRESTORE_SCHEMA.md`, `firebase` dep in `package.json`, `appConfig.useMockData`, `VITE_USE_MOCK_DATA` env var. Bonus: clears the critical `protobufjs` CVE (transitive via firebase/firestore). ~300 KB bundle shrink. Note: if we pursue Option C (Firebase-as-cache), this cleanup is effectively reversed — so resolve the perf decision before doing item 15.
- `npm audit` — after item 15 cleanup, re-audit for residual dev-only findings (picomatch, brace-expansion, vite bump).
- OnSite Medical agent's real call behavior is anomalous: 80% hangup-on-voicemail, 4 "completed" calls with 0-16 char transcripts ending mid-sentence ("human: This is."). Not our bug — real campaign signal. Worth flagging to Jason at some point but doesn't affect dashboard code.
- Bundle size warning from Vite: 642 KB. Mostly dead firebase weight — item 15 will shrink it naturally. No action needed pre-cleanup.
