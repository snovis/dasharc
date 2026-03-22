# DashARC — Claude Code Reference

## What This Is
Interactive call reporting dashboard for SDR (Sales Development Representative) teams.
Built for SalesARC (client: Jason Nordgren). Hosted on Vercel, data in Firebase.

## Stack
- **Vite + React 18** — frontend build tool and UI framework
- **Recharts** — horizontal stacked bar charts
- **Tailwind CSS v4** — utility-first styling (configured via `@tailwindcss/vite` plugin)
- **TanStack Query** — data fetching and caching
- **React Router v7** — client-side routing
- **Firebase** — Firestore (data) + Firebase Auth (auth)
- **n8n** — external workflow tool that writes Synthflow call data → Firestore

## Architecture: Single-Tenant / Cloneable
This app is designed for one client at a time. To deploy for a new client:
1. Copy `.env.example` → `.env`
2. Fill in their Firebase project credentials and company name
3. Deploy to Vercel (or their own server)

No multi-tenant SaaS pattern — separate deployment per client.

## Environment Variables
See `.env.example` for all required variables. Key ones:
- `VITE_USE_MOCK_DATA=true` — uses `src/mock/callData.js` instead of Firestore (for development)
- `VITE_FIREBASE_*` — Firebase project credentials
- `VITE_COMPANY_NAME` / `VITE_APP_NAME` — displayed in the UI

## Key Directories
```
src/
  config/app.js          # Tenant config from env vars
  firebase/              # Firebase init, auth helpers
  mock/callData.js       # Mock data + aggregation helpers (matches Firestore shape)
  hooks/
    useAuth.js           # Auth state (mock-aware)
    useCallData.js       # Data queries (swap mock ↔ Firestore via env var)
  components/
    charts/              # Recharts chart components
    dashboard/           # FilterBar, other dashboard-specific components
    layout/              # Layout shell, ProtectedRoute
    ui/                  # Shared UI: Card, Spinner
  pages/
    LoginPage.jsx
    DashboardPage.jsx    # Main view: two charts + filter + summary stats
    AgentDetailPage.jsx  # Per-agent call log table
    CallDetailPage.jsx   # Individual call metadata + audio/transcript (placeholder)
```

## Data Flow
```
Synthflow (VOIP) → n8n workflow → Firebase Firestore → DashARC React app
SalesForce (CRM) → n8n workflow → Firebase Firestore (TBD — see open questions)
```

## Open Design Questions
1. **Synthflow audio/transcript access** — How does the dashboard access recordings?
   - Option A: n8n writes audio URLs + transcripts to Firestore
   - Option B: Dashboard deep-links into Synthflow UI
   - Option C: Hybrid
   - BLOCKS: `CallDetailPage.jsx` audio/transcript sections

2. **Auth roles** — Initial build is manager-only (all agents visible). SDR self-view is future work.

3. **SalesForce integration** — Does data flow through SalesForce or directly Synthflow → n8n → Firebase?

## Auth
Firebase Auth with email/password. To add Google OAuth later: add a provider in Firebase console + one `signInWithPopup` call. No structural changes needed.

In mock mode (`VITE_USE_MOCK_DATA=true`), auth is bypassed automatically — no Firebase credentials required for local development.

## Adding a New Client
1. Create a Firebase project for them
2. Enable Firestore + Auth (email/password)
3. Create their admin user in Firebase Auth console
4. Copy `.env.example` → `.env`, fill in their credentials and company name
5. Deploy

## GitHub
- Repo: `snovis/dasharc`
- Collaborator: `emberdark-agent` (Ember)

## Vercel
- Framework preset: Vite
- Add all `VITE_*` env vars from `.env` in Vercel project settings
- Production branch: `main`

## Commands
```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Build for production
npm run preview  # Preview production build locally
```
