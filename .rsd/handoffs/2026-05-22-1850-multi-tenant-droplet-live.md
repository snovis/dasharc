# Handoff

Written: 2026-05-14 10:44 · Context used: unknown
Branch: main · Last commit: ed7a8aa

## What we're working on

Still onboarding Mnatalis (oksklient@gmail.com) as the second developer/user on DashARC. Earlier this session: GitHub collaborator + branch protection. Now: dashboard sign-in access via `ALLOWED_EMAILS`, deployed to prod.

## What just happened

- Edited local `.env` to append `oksklient@gmail.com` to `ALLOWED_EMAILS`. `.env` is gitignored so it stays uncommitted by design.
- Replaced Vercel **production** env var `ALLOWED_EMAILS` (via `vercel env rm` + `vercel env add`). Both CLI calls returned success.
- Ran `vercel --prod` — build succeeded (786 modules, 1.11s), deployed `dpl_HK71sPBPcGkueB2xw2eej9tFmBx2`, status `READY`, aliased to https://dasharc-local.vercel.app. New ALLOWED_EMAILS list is now active on the running deployment.
- Bundle warning unchanged: 868 KB main chunk — same dead-firebase weight that item 15 cleanup is set to resolve.

## What's open

- No active walk. No active code task.
- **Mnatalis still hasn't accepted the GitHub collaborator invite** (sent earlier this session, invite id `317998003`, expires 7 days from 2026-05-14). Accept page: https://github.com/snovis/dasharc/invitations.
- **Sign-in flow not yet end-to-end verified** for Mnatalis. The deploy is live and the email is on the allowlist, but no one has actually signed in as `oksklient@gmail.com` and confirmed the dashboard loads. If something fails, first thing to check is whether their Google account email exactly matches (case insensitive on the server, see `api/_lib/verify-token.js`).
- Remaining onboarding still not done:
  - If Mnatalis needs `.env` for local dev: share values or have them stand up their own (`VITE_GOOGLE_CLIENT_ID`, `SYNTHFLOW_API_KEY`, etc.). Their email is now in `ALLOWED_EMAILS` locally too.
  - If they'll deploy/preview on Vercel: add as member in Vercel Project Settings → Members.
  - Confirm `http://localhost:3000` (or their `vercel dev` port) is in the Google OAuth client's Authorized JavaScript Origins.

## Recent decisions

- 2026-05-14: Triggered `vercel --prod` right after editing env vars instead of waiting for the next code push. Reason: env var changes don't apply to the running deployment until redeploy, and the whole point of editing was to give Mnatalis access now.

## Open threads (not current focus)

- Local workflow constraint from earlier this session: `main` is protected — feature-branch + PR required for code commits. (`enforce_admins=false` lets Scott bypass when needed, as happened on the prior handoff commit.)
- **Persistent cache + incremental fetch** (the bigger perf play): TanStack Query `persistQueryClient` + IndexedDB persister + Synthflow `fromDate` deltas. Revisit when first-load-after-clear stops feeling fast or when total records exceed ~5k.
- **Vercel project rename** (`dasharc-local` → `dasharc`): procedure in `.rsd/docs/2026-04-23-1527-vercel-project-naming-and-rename-procedure.md`. Tied to first-real-client onboarding.
- Item 9 (deferred from prior walk): silent Google ID token refresh before 1-hour JWT expiry. Still open.
- Item 15 (deferred from prior walk): delete dead `src/firebase/`, `src/mock/callData.js`, `firebase` dep, `appConfig.useMockData`, `VITE_USE_MOCK_DATA`. ~300 KB bundle shrink + clears `protobufjs` CVE.
- OnSite Medical agent's anomalous behavior (80% hangup-on-voicemail, truncated transcripts) — real campaign signal, not our bug. Worth flagging to Jason eventually.
