# Handoff

Written: 2026-04-23 16:19 · Context used: ~40%
Branch: main · Last commit: ad6d1a2

## What we're working on

DashARC is live in production at `https://dasharc-local.vercel.app`. First-load perf was the active concern (Daniel had been seeing 5-8s loads). Option A (parallel pagination) shipped and verified faster by Scott in prod. No active work item now — handed off after deploy + a saved doc on the Vercel-naming gotcha.

## What just happened

- Refactored `fetchAllCalls` in `src/hooks/useCallData.js`: page 1 fetched alone to read `pagination.total_records`, pages 2..N fan out in parallel batches of 8 via `Promise.all`. Order preserved by input-array indexing. Build green.
- Pushed `33ac890` to `main`; Vercel auto-deployed; Scott confirmed in prod ("okay, it loads faster"). No browser-driven measurement on my side — verification was Scott's eyes-on.
- Skipped the walk machinery for this — agreed it was process bloat for a 30-min single-file refactor. Just implemented and shipped.
- Saved `.rsd/docs/2026-04-23-1527-vercel-project-naming-and-rename-procedure.md` (commit `ad6d1a2`) capturing why prod URL is `dasharc-local.vercel.app`, how to rename it, and the OAuth-origin gotcha.

## What's open

- No active walk.
- No active code task. The follow-on perf work (persistent cache + incremental fetch via TanStack Query's `persistQueryClient` + IndexedDB + Synthflow `fromDate` deltas) was discussed earlier this session but explicitly *not* started — Scott wanted to see if Option A alone was enough first. It was, for now. Revisit when call volume grows or when first-visit-after-clear becomes painful.
- Project rename `dasharc-local` → `dasharc`: Scott deferred it ("we'll come back when I need to add the actual client. I might change it then"). Procedure preserved in the doc above. Deferred indefinitely.

## Recent decisions

- 2026-04-23: Shipped Option A (parallel pagination, CONCURRENCY=8) without a walk and without local `vercel dev` testing. Reasoning: small single-file change, build was green, rollback is one-line `git revert 33ac890`. Verified post-deploy by Scott in prod.
- 2026-04-23: Deferred Vercel project rename. Will revisit at the same time as onboarding a real client (when branding/URL becomes client-facing rather than just Daniel's bookmark).
- 2026-04-23: Deferred the persistent-cache + incremental-fetch follow-on. Option A's speedup was sufficient for current call volume.

## Open threads (not current focus)

- **Persistent cache + incremental fetch** (the bigger perf play): TanStack Query `persistQueryClient` + IndexedDB persister + use Synthflow's `fromDate` to fetch only deltas since the most recent cached call. Scales to 10k+ records without infrastructure (no Firebase). Revisit when first-load-after-clear stops feeling fast or when total records exceed ~5k.
- **Vercel project rename** (`dasharc-local` → `dasharc`): full procedure in `.rsd/docs/2026-04-23-1527-vercel-project-naming-and-rename-procedure.md`. Tied to first-real-client onboarding.
- Item 9 (deferred from prior walk): silent Google ID token refresh before 1-hour JWT expiry. Still open.
- Item 15 (deferred from prior walk): delete dead `src/firebase/`, `src/mock/callData.js`, `firebase` dep, `appConfig.useMockData`, `VITE_USE_MOCK_DATA`. ~300 KB bundle shrink + clears `protobufjs` CVE. Note: deferring the Firebase-as-cache option means item 15 cleanup is now safe to do whenever — no longer gated on the perf decision.
- OnSite Medical agent's anomalous behavior (80% hangup-on-voicemail, truncated transcripts) — real campaign signal, not our bug. Worth flagging to Jason eventually.
- Bundle size warning from Vite: 642 KB. Mostly dead firebase weight; resolves naturally with item 15.
