# DashARC — Claude Code Reference

## What This Is
Interactive call reporting dashboard for SDR teams on Synthflow. Built and operated by SalesARC (contact: Jason Nordgren). **Multi-tenant**: one deployment serves many client organizations ("accounts"), and each signed-in user sees only the accounts — and the Synthflow agents within them — that they're granted in config.

## Stack
- **Vite + React 19** — frontend
- **Tailwind CSS v4** — styling (`@tailwindcss/vite` plugin)
- **Recharts** — stacked bar + daily volume charts
- **TanStack Query** — data fetching with paginated Synthflow walks
- **React Router v7** — client routing
- **Express 5** (`server/`) — Synthflow proxy + JWT auth gate, runs at `127.0.0.1:4100`
- **Google Sign-In (GIS)** + **Microsoft (MSAL, `@azure/msal-browser`)** — browser-based ID token issuance
- **`jose`** — server-side ID token verification (Google + Microsoft JWKs)
- **`yaml`** — parses the multi-tenant account/user config
- **Synthflow** — source of truth for all call data (no local copy)

**No database.** The dashboard is a filtered GUI over Synthflow's API. Accounts, agents, and user access live in a YAML config file.

## Architecture

```
┌─────────────────┐   GIS / MSAL    ┌───────────────────┐         ┌─────────────────┐
│ Browser (React) │────────────────▶│ Google / Microsoft│         │ Synthflow API   │
│                 │                 └───────────────────┘         │ (v2/assistants, │
│  id_token (JWT) │                                               │  v2/calls)      │
└────────┬────────┘                                               └────────▲────────┘
         │ Authorization: Bearer <id_token>                                │
         ▼                                                                 │
┌──────────────────────────────────────────────────────────┐  Bearer key  │
│ DigitalOcean droplet (dashboard.rymare.com)               │──────────────┘
│                                                            │
│  nginx :443 ── TLS, serves dist/ (SPA) + proxy_pass ─┐     │
│                                                      ▼     │
│  Express server/  (systemd: dasharc-api, :4100)            │
│   - server/auth.js → api/_lib/verify-token.js (shared)     │
│   - routes/: me, agents, calls, call, demoTrigger          │
│   - config.js loads accounts.yaml (accounts + users)       │
│   - reads env: VITE_GOOGLE_CLIENT_ID, VITE_MICROSOFT_      │
│     CLIENT_ID, SYNTHFLOW_API_KEY, ACCOUNTS_CONFIG_PATH     │
└────────────────────────────────────────────────────────────┘
```

Every `/api/*` request flow:
1. Verify `Authorization: Bearer <id_token>` against Google **or** Microsoft JWKs (issuer-detected) via `jose`
2. Resolve the decoded email against the YAML `users` list (`resolveUserAccess`) → **403** if not listed. (`ALLOWED_EMAILS` env is an *optional* extra gate, left unset on the droplet — the YAML is the authoritative allowlist.)
3. For per-agent endpoints: verify `agentId` ∈ the user's `access.agentIds`. For per-account endpoints (demo trigger): verify `accountId` ∈ the user's accounts.
4. Forward to Synthflow with the server-side `SYNTHFLOW_API_KEY`
5. Sanitize (strip SIP headers, etc.) and return JSON

## Multi-Tenant Model

- **Accounts** = customer organizations (e.g. `onsite-medical`). Each owns one or more Synthflow agents, optional branding, and an optional `demo_trigger_url`.
- **Agents** = Synthflow `model_id`s, each belongs to exactly one account.
- **Users** = emails, each granted one or more accounts. `accounts: ["*"]` grants every account (support/admin).
- **Roles**: `support` and `admin` both typically use `["*"]`. `is_support` (drives the "viewing as support" badge) is true when the user is wildcard **or** `role: support`.
- **Branding** is per-account (`branding.company_name`, optional `primary_color`/`logo_url`) and applies once an account is selected. The global `VITE_APP_NAME` / `VITE_COMPANY_NAME` are only build-time fallbacks (default `DashARC` / `SalesARC`).

Config is read **once at server startup**. After editing it you must restart the API (`systemctl restart dasharc-api` on the droplet; restart `npm run dev:api` locally).

## Environment Variables
See `.env.example`. Current list:
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth 2.0 Web Client ID (browser-facing)
- `VITE_MICROSOFT_CLIENT_ID` — Azure app (client) ID; presence enables Microsoft sign-in
- `SYNTHFLOW_API_KEY` — server-side only, **never** prefix with `VITE_`
- `ACCOUNTS_CONFIG_PATH` — absolute path to the YAML config (droplet: `/etc/dasharc/accounts.yaml`; defaults to `config/accounts.local.yaml` when unset)
- `PORT` — Express port (default `4100`)
- `ALLOWED_EMAILS` — *optional/legacy* coarse env gate; unset on the droplet
- `VITE_APP_NAME`, `VITE_COMPANY_NAME` — global branding fallbacks (per-account branding in YAML overrides in-app)

## Key Directories

```
server/
  index.js               # Express app: mounts routers, /api/health, listen :4100
  config.js              # loadConfig() parses YAML → accounts/users; resolveUserAccess(email)
  auth.js                # requireAuth middleware: verifyRequest + resolveUserAccess
  routes/
    me.js                # GET /api/me — user identity + accounts/agents/branding (drives selectors)
    agents.js            # GET /api/agents — agents the user can see
    calls.js             # GET /api/calls?agentId=&fromDate=&toDate=
    call.js              # GET /api/call?id=<callId>
    demoTrigger.js       # POST /api/demo-trigger?accountId= — forwards to account's demo_trigger_url
config/
  accounts.example.yaml  # template (committed)
  accounts.local.yaml    # local dev config (gitignored)
api/
  _lib/verify-token.js   # Shared token verification (jose, Google+Microsoft). Used by Express.
  agents.js, calls.js,   # LEGACY Vercel serverless handlers — kept as rollback path only
  call.js                #   (not used by the droplet deployment)
src/
  config/app.js          # Global build-time branding/client-id fallbacks from env
  lib/synthflow.js       # Status normalization, formatters, transcript parsing
  hooks/
    useAuth.jsx          # AuthContext: Google/MS ID token + user (sessionStorage)
    useCallData.js       # useAgents, useCalls, useCall (walks pagination)
  components/
    charts/              # CallOutcomesChart, CallsOverTime
    dashboard/           # FilterBar
    layout/              # Layout shell, ProtectedRoute, account/agent selectors
    ui/                  # Card, Spinner
  pages/
    LoginPage.jsx        # Google + Microsoft sign-in buttons
    DashboardPage.jsx    # KPI cards + 2 charts (outcomes + over time) + Demo Call button
    AgentDetailPage.jsx  # Sorted call log table
    CallDetailPage.jsx   # Metadata + audio + chat transcript + AI judge_results
```

## Data Flow
```
Browser ─(Google / Microsoft sign-in)─→ provider ─(id_token)─→ Browser
Browser ─(Bearer id_token)─→ /api/* (Express on droplet) ─(API key)─→ Synthflow ─→ Browser
```

On login the frontend calls `/api/me` to learn the user's accounts/agents/branding, then renders the account selector (collapses to a label when only 1 account) and the page-header agent selector (only when >1 agent). Every render that needs fresh data fires Synthflow calls through the proxy. TanStack Query caches results (2 min for calls, 10 min for agents/single-call detail). Synthflow outage → dashboard shows a "failed to load" banner.

## Auth
- **Google Sign-In** via `google.accounts.id` (script in `index.html`) and **Microsoft** via `@azure/msal-browser`.
- The callback hands the ID token to `useAuth().signIn(token)`, which decodes the JWT for `{email, name, picture}` and persists to `sessionStorage` (survives reloads, auto-expires on JWT `exp`).
- API calls attach `Authorization: Bearer <idToken>`; the server verifies via `api/_lib/verify-token.js`. Issuer is auto-detected: Google (`accounts.google.com`) or Microsoft v2 (`login.microsoftonline.com/<tenant>/v2.0`).
- Authorization is the YAML `users` list: an unlisted email gets a **403** from `requireAuth`.
- **Silent refresh before 1hr expiry is deferred** (known rough edge). Users hitting an expired token get a load error + reload-to-reauth. See `.rsd/walks/` for the deferral notes.

## Adding / Managing Users

Users and their account access live in the YAML config — **not** env vars, **not** any external system. The authoritative production copy is `/etc/dasharc/accounts.yaml` on the droplet (mode `640 root:root`, gitignored locally).

To **add a user**, append an entry under `users:`:
```yaml
users:
  - email: newperson@clientco.com
    accounts: [onsite-medical]          # one or more account IDs, OR ["*"] for all
    # role: support                      # optional: support|admin (support shows the badge)
```
- `email` is lowercased on load; case doesn't matter.
- `accounts` must reference IDs that exist under `accounts:` (unknown IDs are warned and ignored).
- A user referencing **no valid accounts** can sign in but sees nothing — double-check the account IDs.

Then **reload config** (it's only read at startup):
```bash
# Edit the live config and restart on the droplet
ssh rymare 'nano /etc/dasharc/accounts.yaml && systemctl restart dasharc-api'
# Confirm it parsed (account/user counts in the log + health):
ssh rymare 'journalctl -u dasharc-api -n 20 --no-pager && curl -s http://127.0.0.1:4100/api/health'
```
For OAuth to succeed, the user's provider must be one whose client ID is configured (`VITE_GOOGLE_CLIENT_ID` / `VITE_MICROSOFT_CLIENT_ID`) and whose origin (`https://dashboard.rymare.com`) is an authorized origin on that OAuth client. No per-user provisioning beyond the YAML line.

## Adding a New Account (Client)
1. Get the Synthflow `model_id`(s) for their agents from SalesARC's agency account.
2. Add an account block under `accounts:` in the YAML (name, branding, agents, optional `demo_trigger_url`).
3. Grant the relevant users access (see above) — or rely on `["*"]` support/admin users.
4. Restart `dasharc-api`.

No new deployment, no env changes — one shared URL, account-level partitioning.

## Deployment (DigitalOcean droplet)

Production runs on Scott's droplet (`ssh rymare`, hostname `rymare-main`) alongside n8n and Rocket Chat. Browser → Cloudflare DNS (grey cloud) → droplet :443 → nginx (TLS) → `proxy_pass http://127.0.0.1:4100` (Express) → Synthflow. nginx serves `/opt/dasharc/dist/` directly with SPA fallback to `index.html`.

```
/opt/dasharc/                  git clone (branch: multi-tenant, pre-cutover)
  ├── dist/                    static frontend, served by nginx
  ├── server/                  Express API
  └── .env                     symlink → /etc/dasharc/env
/etc/dasharc/
  ├── env                      640 root:root — secrets + VITE_ build-time vars
  └── accounts.yaml            640 root:root — multi-tenant config
/etc/systemd/system/dasharc-api.service
/etc/nginx/sites-available/dasharc  (symlinked from sites-enabled/)
/etc/letsencrypt/live/dashboard.rymare.com/  (auto-renewing cert)
```

Common ops:
```bash
ssh rymare 'journalctl -u dasharc-api -n 100 -f'                 # logs
ssh rymare 'systemctl restart dasharc-api'                       # reload after editing accounts.yaml
ssh rymare 'cd /opt/dasharc && git pull && npm ci && npm run build && systemctl restart dasharc-api'  # deploy code
ssh rymare 'curl -s http://127.0.0.1:4100/api/health'            # verify
```
After a frontend (`dist/`) deploy, hard-refresh the browser — the JS bundle is cached.

> **Legacy Vercel**: the original single-tenant Vercel project and the `api/*.js` serverless handlers remain in the tree as a rollback path. They share `api/_lib/verify-token.js` with the Express server. Decommission (and delete the legacy `api/` dir) once confidence in the droplet is solid.

## GitHub
- Repo: `snovis/dasharc` (public)
- Main branch: `main`
- Active branch for multi-tenant work: `multi-tenant` (PR #2)

## Commands
```bash
npm run dev      # Vite + Express together (concurrently) — full stack
npm run dev:web  # Vite only (frontend, no /api)
npm run dev:api  # Express only (node --watch, reads .env)
npm run build    # Production build → dist/
npm run preview  # Preview the production build locally
npm run lint     # ESLint
```
Local API config defaults to `config/accounts.local.yaml` unless `ACCOUNTS_CONFIG_PATH` is set.

## Demo Call Button

A "Demo Call" button lives on the DashboardPage. It opens a modal where an authorized user enters a first name and US phone number, then triggers a Synthflow outbound call via n8n.

### How it works
Browser → `POST /api/demo-trigger?accountId=<id>` (Express) → the account's `demo_trigger_url` (n8n webhook) → Synthflow API → outbound call. The webhook URL is **per-account** in the YAML (not an env var); the server forwards `{ phone, first_name }` only if the user can access that account.

### n8n workflow (OnSite Medical)
Workflow: `OnSite-Manual-Demo-Trigger-v1` in the `onSite-Medical2` folder on `salesarcsolutions.app.n8n.cloud`.
`demo_trigger_url`: `https://salesarcsolutions.app.n8n.cloud/webhook/onsite-demo-trigger`
Synthflow agent: `OnSite Medical - Dispatch Enrollment Assistant` (model_id: `0df733c4-a8fb-4d14-a12a-55fc62396bc7`).
Request shape: `{ phone: string, first_name: string }`.

### Access control
Any user with access to the account can trigger its demo calls. No further role gating, no server-side phone format validation or rate limiting currently — add if needed.

## Transitional / Dead Code

Awaiting deletion in a future cleanup:
- `src/firebase/` — old Firestore + Firebase Auth helpers, unreferenced
- `src/mock/callData.js` — old mock data, unreferenced
- `firebase` in `package.json` dependencies (transitive `protobufjs` CVE will self-resolve on removal)
- `appConfig.useMockData` in `src/config/app.js` + `VITE_USE_MOCK_DATA` — defined/read but no longer wired to anything
- Legacy Vercel `api/*.js` handlers (see Deployment note) — remove after Vercel decommission
