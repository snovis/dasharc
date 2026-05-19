# DashARC — Claude Code Reference

## What This Is
Interactive call reporting dashboard for SDR teams on Synthflow. Built for SalesARC (client: Jason Nordgren). Each deployment serves one client and surfaces only the Synthflow agents assigned to them.

## Stack
- **Vite + React 18** — frontend
- **Tailwind CSS v4** — styling (`@tailwindcss/vite` plugin)
- **Recharts** — stacked bar + daily volume charts
- **TanStack Query** — data fetching with paginated Synthflow walks
- **React Router v7** — client routing
- **Vercel serverless functions** (`/api/*`) — thin Synthflow proxy, JWT auth gate
- **Google Sign-In (GIS)** — browser-based ID token issuance
- **`google-auth-library`** — server-side ID token verification
- **Synthflow** — source of truth for all call data (no local copy)

**No database.** The dashboard is a filtered GUI over Synthflow's API. Allowlist + agent IDs are env-var config.

## Architecture

```
┌─────────────────┐         ┌───────────────────┐         ┌─────────────────┐
│ Browser (React) │──GIS──→ │ Google OAuth      │         │ Synthflow API   │
│                 │         └───────────────────┘         │ (v2/assistants, │
│  id_token (JWT) │                                       │  v2/calls)      │
└────────┬────────┘                                       └────────▲────────┘
         │ Authorization: Bearer <id_token>                        │
         ▼                                                         │
┌─────────────────────────────────────────────┐  Bearer key        │
│ Vercel serverless /api/*                    │────────────────────┘
│  - verify-token.js (shared auth helper)     │
│  - agents.js, calls.js, call.js (proxies)   │
│  - Reads env vars: VITE_GOOGLE_CLIENT_ID,   │
│    SYNTHFLOW_API_KEY, ALLOWED_EMAILS,       │
│    AGENT_IDS                                │
└─────────────────────────────────────────────┘
```

Every `/api/*` request flow:
1. Verify `Authorization: Bearer <google_id_token>` against Google's JWKs
2. Verify the decoded email is in `ALLOWED_EMAILS`
3. For per-call/per-agent endpoints: verify `agentId` / `call.model_id` is in `AGENT_IDS`
4. Forward to Synthflow with the server-side `SYNTHFLOW_API_KEY`
5. Sanitize (strip prompts, webhook URLs, SIP headers) and return JSON

## Single-Tenant / Cloneable

One Vercel deployment per client. Different clients get different:
- `ALLOWED_EMAILS` (who can sign in)
- `AGENT_IDS` (which Synthflow agents they see)
- `VITE_COMPANY_NAME` / `VITE_APP_NAME` (UI branding)

SalesARC's agency-level Synthflow account and single `SYNTHFLOW_API_KEY` can back all client deployments — the `AGENT_IDS` allowlist partitions visibility. One key, many narrow-scope deployments.

## Environment Variables
See `.env.example`. Full list:
- `VITE_APP_NAME`, `VITE_COMPANY_NAME` — UI display strings
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth 2.0 Web Client ID (browser-facing)
- `SYNTHFLOW_API_KEY` — server-side only, **never** prefix with `VITE_`
- `ALLOWED_EMAILS` — comma-separated, case-insensitive
- `AGENT_IDS` — comma-separated Synthflow `model_id` UUIDs

## Key Directories

```
api/
  _lib/verify-token.js   # Shared: verify Google ID token + allowlist
  agents.js              # GET /api/agents — list filtered to AGENT_IDS
  calls.js               # GET /api/calls?agentId=&fromDate=&toDate=
  call.js                # GET /api/call?id=<callId>
src/
  config/app.js          # Tenant config from env vars
  lib/synthflow.js       # Status normalization, formatters, transcript parsing
  hooks/
    useAuth.jsx          # AuthContext: Google ID token + user (sessionStorage)
    useCallData.js       # useAgents, useCalls, useCall (walks pagination)
  components/
    charts/              # CallOutcomesChart, CallsOverTime
    dashboard/           # FilterBar
    layout/              # Layout shell, ProtectedRoute
    ui/                  # Card, Spinner
  pages/
    LoginPage.jsx        # Google Sign-In button
    DashboardPage.jsx    # KPI cards + 2 charts (outcomes + over time)
    AgentDetailPage.jsx  # Sorted call log table
    CallDetailPage.jsx   # Metadata + audio + chat transcript + AI judge_results
```

## Data Flow
```
Browser ─(Google Sign-In)─→ Google ─(id_token)─→ Browser
Browser ─(Bearer id_token)─→ /api/* (Vercel) ─(API key)─→ Synthflow ─→ Browser
```

Every dashboard render that needs fresh data fires Synthflow API calls through the proxy. TanStack Query caches results (2 min for calls, 10 min for agents/single-call detail). Synthflow outage → dashboard shows a "failed to load" banner.

## Auth
- **Google Sign-In** via the `google.accounts.id` browser library (script loaded in `index.html`)
- Callback hands the ID token to `useAuth().signIn(token)`, which decodes the JWT for `{email, name, picture}` and persists to `sessionStorage` (survives reloads, auto-expires on JWT `exp` claim)
- API calls attach `Authorization: Bearer <idToken>`; server verifies via `api/_lib/verify-token.js`
- `ALLOWED_EMAILS` denies 403 if the caller isn't authorized
- **Silent refresh before 1hr expiry is deferred** (tracked as a known rough edge). Users hitting an expired token get a load error + reload-to-reauth. See `.rsd/walks/` for the deferral notes.

## Adding a New Client
1. Google Cloud Console: add the new Vercel production URL to the OAuth client's authorized JavaScript origins (or create a separate OAuth client per deployment)
2. Identify the Synthflow `model_id`s for their agents in SalesARC's agency account
3. Copy `.env.example` → `.env`:
   - `VITE_GOOGLE_CLIENT_ID` — the OAuth client
   - `SYNTHFLOW_API_KEY` — SalesARC's agency key (same across clients)
   - `ALLOWED_EMAILS` — the client's users
   - `AGENT_IDS` — only this client's agent UUIDs
   - `VITE_APP_NAME` / `VITE_COMPANY_NAME` — branding
4. Deploy to a fresh Vercel project

No database setup, no user provisioning — just env vars.

## GitHub
- Repo: `snovis/dasharc`
- Main branch: `main`

## Vercel
- Framework preset: Vite
- Serverless functions live in `/api/` (Vercel auto-detects)
- Set all env vars from `.env` in Project Settings → Environment Variables
- Local end-to-end dev: `vercel dev` (runs `/api/*` proxies + Vite on one port)
- Pure-frontend dev: `npm run dev` (no `/api/*` — useful for UI-only work)

## Commands
```bash
npm run dev      # Vite dev server — frontend only (no /api)
vercel dev       # Vite + serverless functions — full stack
npm run build    # Production build
npm run preview  # Preview the production build locally
```

## Transitional State (pending item 15 cleanup)

The following are dead code awaiting deletion in the final cleanup:
- `src/firebase/` — old Firestore + Firebase Auth helpers, unreferenced
- `src/mock/callData.js` — old mock data, unreferenced
- `firebase` in `package.json` dependencies — transitive `protobufjs` CVE will self-resolve
- `appConfig.useMockData` in `src/config/app.js` — defined but unread
- `VITE_USE_MOCK_DATA` env var — no longer read anywhere

Why they still exist: the `synthflow-direct` pivot kept them in place as a rollback safety net. After the item 14 smoke test validates the new flow end-to-end, they get purged together.

## Demo Call Button

A "Demo Call" button lives on the DashboardPage. It opens a modal where an authorized user enters a first name and US phone number, then triggers a Synthflow outbound call via n8n.

### How it works
Browser → `/api/demo-trigger` (Vercel serverless) → `N8N_DEMO_TRIGGER_URL` (n8n webhook) → Synthflow API → outbound call

### Environment variable
`N8N_DEMO_TRIGGER_URL` — the n8n webhook URL that accepts `{ phone, first_name }` and triggers the call. Set to the SalesARC-owned n8n instance:
`https://salesarcsolutions.app.n8n.cloud/webhook/onsite-demo-trigger`

### n8n workflow
Workflow: `OnSite-Manual-Demo-Trigger-v1` in the `onSite-Medical2` folder on `salesarcsolutions.app.n8n.cloud`.
Synthflow agent: `OnSite Medical - Dispatch Enrollment Assistant` (model_id: `0df733c4-a8fb-4d14-a12a-55fc62396bc7`).
Request shape: `{ phone: string, first_name: string }`.

### Access control
Any email in `ALLOWED_EMAILS` can trigger demo calls. No role gating. No server-side phone format validation or rate limiting currently — add if needed.
