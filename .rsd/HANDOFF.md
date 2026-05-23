# Handoff

Written: 2026-05-22 18:50 PT · Context used: (unavailable)
Branch: multi-tenant · Last commit: 43deb29

## What we're working on

Multi-tenant rebuild of DashARC, now serving at https://dashboard.rymare.com from Scott's DigitalOcean droplet (the same box that runs n8n + Rocket Chat). The old Vercel single-tenant model is being replaced by a YAML-config-driven dashboard where one URL serves N customer accounts; SalesARC support staff have wildcard access to every account.

Slice: PR #2 (https://github.com/snovis/dasharc/pull/2) on branch `multi-tenant`. Vercel deployment on `main` is still live as a rollback path.

## What just happened

- Express server in `server/` deployed to `/opt/dasharc/` on the droplet, running as `dasharc-api.service` (systemd, `127.0.0.1:4100`). Verified via `journalctl -u dasharc-api` showing "2 accounts, 10 users" + 200 on `/api/health`.
- nginx vhost at `/etc/nginx/sites-available/dasharc` proxies `/api/*` to the Node service and serves `/opt/dasharc/dist` for the SPA. Let's Encrypt cert issued for `dashboard.rymare.com` (auto-renew via certbot).
- Frontend: sidebar `AccountSelector` (collapses to plain label for 1-account users), header `AgentSelector` for multi-agent accounts, `SupportBadge` for wildcard users. URL-backed selection: `?account=X&agent=Y`.
- OnSite Medical + Onboard 360 (`60a232ad-fe25-4fb5-afc2-41cfc8b2937e`) both configured in `/etc/dasharc/accounts.yaml`. Scott verified sign-in + the dashboard renders.
- Favicon swapped to the rymare leaf PNG from `leads.archie.rymare.com/icon.png`. Verified `https://dashboard.rymare.com/favicon.png` returns 200 and `index.html` references it.

## What's open

- **Onboard 360 user emails not yet added.** Only Scott + SalesARC wildcard users (Daniel, Nicole, Jason, Jepson) can currently see the Onboard 360 account. Add when Scott provides them: edit `/etc/dasharc/accounts.yaml` on the droplet (or commit to `config/accounts.local.yaml` for local), then `ssh rymare 'systemctl restart dasharc-api'`.
- **Vercel decom is task #9, intentionally deferred.** Scott wants to keep Vercel running until he's confident in the droplet deploy. When ready: disable auto-deploy on the Vercel project, merge PR #2 to `main`, then delete the project.
- **CLAUDE.md is stale.** Still describes single-tenant Vercel architecture. Update after Vercel decom so a fresh agent doesn't get confused. Memory has been updated — see `project_dasharc.md`, `reference_dasharc_droplet.md`, `reference_dasharc_gcp.md`.
- **Legacy `api/` dir is still in tree.** Shared with the Vercel deployment via `api/_lib/verify-token.js` (which the new Express server also imports). Delete after Vercel decom.
- Next likely action: wait for Scott. When he sends Onboard 360 emails, add them; when he gives the decom go-ahead, do the Vercel teardown sequence.

## Recent decisions

- 2026-05-22: Architecture pivot — one multi-tenant droplet URL replaces N Vercel projects. Triggered by Scott getting requests for more dashboards as more SalesARC clients onboard.
- 2026-05-22: Account-level access (not agent-level). Adding an agent to an account auto-grants visibility to every user of that account. Sub-account granularity deferred until anyone actually asks for it.
- 2026-05-22: systemd + git-clone deploy (not Docker). DashARC is Scott's own code; Docker would be self-imposed packaging overhead vs n8n/Rocket Chat which are upstream images.
- 2026-05-22: Subdomain is `dashboard.rymare.com` (singular). Scott corrected my plural `dashboards`.
- 2026-05-22: `ALLOWED_EMAILS` env var made optional — YAML config is the authoritative allowlist on the droplet; env-level gate only enforced if set (keeps Vercel deployment working during transition).

## Open threads (not current focus)

- Selector UX: today the default landing account is whichever appears first in `accounts.yaml`. For SalesARC support, that's OnSite Medical. Could add a per-user `default_account` field if it ever matters; not now.
- For an "All agents within account" view, charts will need stacked-by-agent rendering — current `aggregateOutcomesByAgent` already segments, but visual treatment may need tuning when accounts get >2 agents.
- Demo Call button is per-account via `demo_trigger_url` in YAML. Onboard 360 doesn't have one configured yet — button is hidden for that account.
- Pre-existing 6 npm audit vulns (transitive Firebase → protobufjs) still in tree; resolves when the legacy Firebase code is removed.
- Bundle size warning (~878 KB) is pre-existing; mostly Firebase + MSAL + Recharts. Address when Firebase comes out.
