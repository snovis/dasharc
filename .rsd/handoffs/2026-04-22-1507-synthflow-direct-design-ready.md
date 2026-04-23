# Handoff

Written: 2026-04-22 15:07 · Context used: (unknown)
Branch: synthflow-direct · Last commit: cebaff5

## What we're working on

Designing (and about to implement) DashARC as a thin React GUI on top of SalesARC's agency-level Synthflow account. The dashboard lets a client view reporting for *their* assigned Synthflow agents only — no database, no sync jobs, live API proxy through Vercel serverless functions, Google OAuth for auth. One Vercel deployment per client.

## What just happened

- Closed the prior `n8n-firebase-bridge` branch with a full pivot rationale (`.rsd/docs/2026-04-22-1140-pivot-to-synthflow-direct.md`) and pushed it to origin with upstream set.
- Cherry-picked `docs/FIRESTORE_SCHEMA.md` onto `main` (commit `0ac9817`) — though it will be deleted as part of the new implementation since there's no Firestore anymore.
- Branched `synthflow-direct` off updated `main`.
- Researched Synthflow's public API via their docs (list-calls, subaccounts, agents, authentication, whitelabel-dashboard pages) — findings captured in conversation; key fact is `GET /v2/calls` requires a `model_id` filter.
- Scott confirmed clients are partitioned by agent IDs (not subaccounts): example IDs `0df733c4-a8fb-4d14-a12a-55fc62396bc7` (OnSite Medical - Dispatch Enrollment) and `48db7b13-e38d-48fe-93ba-d4a0a8f7e05b` (SalesArc - Jessica - Outbound).
- Wrote the final design spec to `.rsd/docs/2026-04-22-1503-synthflow-direct-design-spec.md` (commit `cebaff5`) — stripped-down architecture, no database, env-var config, single-tenant cloneable.

## What's open

- Open: implementing the design spec on `synthflow-direct`. Nothing coded yet on this branch beyond the schema doc that will be deleted.
- Reproduce/check by: `git log --oneline` on `synthflow-direct` shows only schema doc (to delete) and `.rsd/docs/` commits.
- Next likely action: start the implementation per `.rsd/docs/2026-04-22-1503-synthflow-direct-design-spec.md`. First steps: delete `src/firebase/`, delete `docs/FIRESTORE_SCHEMA.md`, remove `firebase` from `package.json`, add `google-auth-library`, then scaffold `api/verify-token.js`.

## Recent decisions

- 2026-04-22: Pivoted away from n8n bridge entirely. Synthflow has a direct API that exposes all call data; scraping n8n workflows is unnecessary.
- 2026-04-22: No database at all. Allowlist and agent list via env vars (`ALLOWED_EMAILS`, `AGENT_IDS`). Call data live-proxied, never stored. Why: Scott found the Firebase/Firestore/SQLite options over-engineered for what is ultimately a filtered-GUI-on-API.
- 2026-04-22: Google OAuth via browser GIS library, stateless JWT verification on API side. No Firebase Auth. Why: if we're dropping Firestore, Firebase Auth is the only reason left to keep the Firebase dependency — and Google Sign-In direct is simpler.
- 2026-04-22: Mock mode dropped. Local dev uses the real Synthflow API key. Why: simpler, and Scott has the key for dev.
- 2026-04-22 (durable feedback): Do NOT invoke any `superpowers:*` skills on this project — Scott finds them process-heavy. Saved to `memory/feedback_brainstorming_style.md`.

## Open threads (not current focus)

- Verify that SalesARC's single Synthflow API key can actually list calls for agents across what we're treating as different "clients" — probably yes (flat agency account), but worth a curl sanity check before committing to the architecture.
- The agent naming convention (`<Client> - <Purpose>`) is useful — could auto-group agents in the UI by parsing the prefix if that becomes valuable later.
- `docs/FIRESTORE_SCHEMA.md` on `main` is now moot; delete as part of first implementation commit.
- Old branch `n8n-firebase-bridge` is preserved on origin with partial work; reusable assets noted in its pivot doc if needed.
- Vercel env var setup will need to be walked through when we're ready to deploy (`GOOGLE_CLIENT_ID`, `SYNTHFLOW_API_KEY`, `ALLOWED_EMAILS`, `AGENT_IDS`).
