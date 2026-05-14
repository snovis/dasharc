# Handoff

Written: 2026-05-14 10:38 · Context used: unknown
Branch: main · Last commit: 5b93844

## What we're working on

No active code task. This session was a one-off ops task: granting a second developer (Mnatalis) access to the repo and locking down `main` so future work flows through PRs. Scott is preparing to collaborate with Mnatalis on DashARC; nothing about the app itself changed.

## What just happened

- Invited GitHub user `Mnatalis` (email `oksklient@gmail.com`) as a collaborator on `snovis/dasharc` with **write** permission. API returned invitation id `317998003`. Pending acceptance — invite expires in 7 days from 2026-05-14.
- Confirmed repo `snovis/dasharc` is `PUBLIC` via `gh repo view` (so cloning works without acceptance; write access does not).
- Applied branch protection on `main` via `PUT /repos/snovis/dasharc/branches/main/protection`. Configuration confirmed in API response: `required_pull_request_reviews.required_approving_review_count=0`, `enforce_admins=false`, `allow_force_pushes=false`, `allow_deletions=false`, `required_linear_history=false`, `required_conversation_resolution=false`. No required status checks (no CI configured).
- No code changes, no commits, no deploys this session. `5b93844` is still HEAD.

## What's open

- No active walk. No active code task.
- **Mnatalis hasn't accepted the invitation yet** (as of write time). They need to accept at https://github.com/snovis/dasharc/invitations or via the email GitHub sent. If they don't accept within 7 days, the invite expires and must be re-issued: `gh api -X PUT repos/snovis/dasharc/collaborators/Mnatalis -f permission=push`.
- **Mnatalis onboarding still has manual steps Scott has not yet done** (mentioned to user but not actioned):
  - Share `.env` values or have Mnatalis stand up their own (`VITE_GOOGLE_CLIENT_ID`, `SYNTHFLOW_API_KEY`, `ALLOWED_EMAILS` including their email, `AGENT_IDS`).
  - If they'll deploy/preview on Vercel: add as member in Vercel Project Settings → Members.
  - Confirm `http://localhost:3000` (or whatever port they use for `vercel dev`) is in the Google OAuth client's Authorized JavaScript Origins.
  - Add Mnatalis's email to `ALLOWED_EMAILS` if they need to actually use the dashboard (separate from being able to read the code).
- Next likely action: wait for Mnatalis to accept; then walk through `.env` setup with them.

## Recent decisions

- 2026-05-14: Added Mnatalis with **write** access (not Admin, not Maintain). Standard "another developer" level — can push, branch, open/merge PRs; cannot change repo settings.
- 2026-05-14: Branch protection on `main` set to **lightest enforceable**: PR required, but 0 approvals required and admins not enforced. Reason: 2-person team, Scott often works solo, and waiting on a review-approval from Mnatalis would block hotfixes. The protection's job here is to prevent *accidental* direct pushes and force-pushes, not to enforce code review.

## Open threads (not current focus)

- Local workflow change Scott now lives with: every commit to `main` must go through a feature branch + PR. `git push origin main` from a local `main` will now be rejected. If this becomes annoying for tiny fixes, the protection can be relaxed or temporarily disabled at https://github.com/snovis/dasharc/settings/branches.
- **Persistent cache + incremental fetch** (the bigger perf play): TanStack Query `persistQueryClient` + IndexedDB persister + use Synthflow's `fromDate` to fetch only deltas since the most recent cached call. Scales to 10k+ records without infrastructure. Revisit when first-load-after-clear stops feeling fast or when total records exceed ~5k.
- **Vercel project rename** (`dasharc-local` → `dasharc`): full procedure in `.rsd/docs/2026-04-23-1527-vercel-project-naming-and-rename-procedure.md`. Tied to first-real-client onboarding.
- Item 9 (deferred from prior walk): silent Google ID token refresh before 1-hour JWT expiry. Still open.
- Item 15 (deferred from prior walk): delete dead `src/firebase/`, `src/mock/callData.js`, `firebase` dep, `appConfig.useMockData`, `VITE_USE_MOCK_DATA`. ~300 KB bundle shrink + clears `protobufjs` CVE.
- OnSite Medical agent's anomalous behavior (80% hangup-on-voicemail, truncated transcripts) — real campaign signal, not our bug. Worth flagging to Jason eventually.
- Bundle size warning from Vite: 642 KB. Resolves naturally with item 15.
