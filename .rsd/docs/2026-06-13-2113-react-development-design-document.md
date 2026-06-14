# React Development Design Document

Written: 2026-06-13 21:13 · Context at save: unknown%
Branch: main · Commit: 85ba203

## Content

### Goal

Set up remote access for a developer to deploy React applications on rymare.com — Vercel-like deployments from our domain on a DigitalOcean droplet — **without giving the developer root access**, in much the same way dasharc is deployed.

### Decisions locked in this session

- **Wildcard subdomain:** `*.apps.rymare.com` — yes.
- **Developer access:** no SSH/shell access. Git push flow is fine.
- **Git transport:** **GitHub as source of truth + auto-deploy.** Dev pushes to a GitHub repo (their normal workflow). A push webhook tells the droplet to pull, build, and deploy.
- **Coexistence:** **Extend the current nginx stack — do NOT install a PaaS.**
- **TLS:** **One wildcard cert** for `*.apps.rymare.com` via Cloudflare DNS-01.
- **Builds run on the droplet** (same as dasharc today) — no GitHub-side build secrets.

---

### The key insight: what actually needs root, and how to remove it

A deploy normally touches root for only two reasons:

1. **Writing into the web root** → solved by giving a dedicated non-root `deploy` user *ownership* of the app directories (`/srv/apps/...`). No sudo needed to publish a build.
2. **Editing nginx vhosts + TLS for each new app, and restarting services** → this is the part that usually forces root. Two tricks eliminate it:
   - **Wildcard subdomain + wildcard cert.** Provision `*.apps.rymare.com` DNS once, a single wildcard Let's Encrypt cert, and one templated nginx server block that maps `<app>.apps.rymare.com` → `/srv/apps/<app>/current/dist`. After that, a *brand-new* app needs **zero** nginx/root changes — it just appears when its directory exists.
   - **systemd *user* services** (`loginctl enable-linger deploy`) for any Node backends — the deploy user runs `systemctl --user restart <app>` with no sudo at all.

---

### Is dasharc "pure React"? No — and this is the key distinction

dasharc's *frontend* is pure static (the `dist/` folder nginx serves). But the app as a whole is **not** static — it has the Express server in `server/` running as a live process (`dasharc-api`, systemd, port 4100). That backend exists for a non-negotiable reason: it holds `SYNTHFLOW_API_KEY` and does auth. A secret like that **cannot** live in a static React bundle — anything in the browser bundle is public. So the moment an app needs a secret, a private API, or server-side auth, it needs a local process.

The real categories aren't "static vs. not" — they're:

| Type | Example | What it needs on the box |
|---|---|---|
| **Pure static SPA** | A React app hitting only public/CORS-enabled APIs, or no backend | Just nginx serving `dist/` |
| **SPA + backend** | **dasharc** — secret-holding proxy, auth, DB | nginx for `dist/` **+** a long-lived process |

---

### Can we start static and grow into backends later? Yes — additively, not a redo

The architecture is forward-compatible:

- **Static app today** = the deploy user's deploy step builds and atomically swaps the `dist/`. nginx (wildcard vhost) serves it. Done.
- **Add a backend later** = the *same* git-push, *same* deploy user, *same* wildcard subdomain. The deploy additionally restarts that app's **rootless systemd user service**, and we add one `proxy_pass` block for its subdomain. The static setup is untouched — you're adding a layer, not rebuilding.

One honest caveat: a dev's *arbitrary backend code* runs with the deploy user's privileges on the same box as n8n/RocketChat. For a trusted dev that's exactly how dasharc already runs and is fine. If the dev is ever untrusted, we move backends into rootless Docker — also an additive change, not a redo.

---

### Why extend nginx instead of a PaaS

This isn't the "don't redo work" reflex. It's wrong *here* because a PaaS (Dokku/CapRover/Coolify) demands ownership of ports 80/443 and the reverse proxy, which would mean re-fronting **n8n, Rocket Chat, and dasharc** — three working production services — behind a new proxy. That's real blast radius on things that already work, in exchange for a web UI you don't need. Extending nginx adds the new capability *beside* what's running, with near-zero risk to it.

---

### Why wildcard cert via Cloudflare DNS-01

Since rymare.com is on Cloudflare, this is clean and standard: a scoped Cloudflare API token + certbot's `dns-cloudflare` plugin issues and auto-renews a single wildcard cert. The payoff is that **every future app needs zero cert work** — it's covered the instant its subdomain exists. We grey-cloud the `apps` subdomain (DNS-only), matching how `dashboard.rymare.com` already works.

---

### Architecture

```
dev ──git push──▶ GitHub repo (snovis/<app>)
                       │ push webhook (HMAC-signed)
                       ▼
   nginx ─▶ hooks.apps.rymare.com ─▶ deploy-listener (systemd, runs as `deploy`, :49xx)
                                          │ verify X-Hub-Signature-256
                                          │ look up app → repo, branch, type
                                          ▼
                       git fetch + reset --hard  →  npm ci && npm run build
                                          │ write releases/<ts>/, atomic swap current→
                                          ▼
   nginx (wildcard *.apps.rymare.com, one wildcard cert)
        ├─ static app:  serve /srv/apps/<app>/current/dist  (SPA fallback)
        └─ backend app: proxy_pass → systemd --user service for that app
```

---

### What gets created

**One-time, root (done once):**
1. **`deploy` system user** — no sudo, no password login. Owns `/srv/apps` (web roots), `/srv/repos` (clones), `/srv/deploy` (listener + config). `loginctl enable-linger deploy` so its systemd *user* services run without a session.
2. **Wildcard DNS** in Cloudflare: `*.apps.rymare.com` → droplet IP, grey-clouded (DNS-only), matching `dashboard.rymare.com`.
3. **Wildcard TLS cert**: scoped Cloudflare API token + `certbot --dns-cloudflare -d '*.apps.rymare.com'`, auto-renewing. Covers every future app *and* the `hooks.apps.rymare.com` webhook endpoint — one cert, forever.
4. **Wildcard nginx vhost**: `server_name *.apps.rymare.com;` with a `map`/`root` that resolves `<app>.apps.rymare.com` → `/srv/apps/<app>/current/dist`, SPA `try_files` fallback. Plus a `hooks.apps.rymare.com` server block → `proxy_pass` to the listener.
5. **Deploy-listener service** — small signed-webhook receiver (Node/Express, ~100 lines) as a `dasharc`-style systemd unit running **as `deploy`**. Verifies GitHub's HMAC, maps repo→app from a config file the `deploy` user owns, runs the deploy script. This is the only new daemon, and it's unprivileged.

**Per new app — mostly no root:**
- In **GitHub** (dev/admin, no box access): create repo, add the push webhook URL + shared secret.
- On the **droplet as `deploy`** (no root): `git clone` into `/srv/repos/<app>`, add a read-only **deploy key** if the repo is private, and append one entry to the listener's `apps.yaml` (`name → repo, branch, build cmd, type: static|backend`).
- **Static app:** that's it — the wildcard vhost + wildcard cert already serve `<app>.apps.rymare.com` the moment `current/dist` exists. **Zero root.**
- **Backend app (later):** add a `systemd --user` unit (deploy-user, no root) **plus** one nginx `proxy_pass` snippet for that subdomain (this single step needs root). Everything else stays self-service.

---

### What needs root vs. not — the important part

| Action | Frequency | Root? |
|---|---|---|
| Redeploy any app (the daily action) | constant | **No** |
| Add a new **static** app | occasional | **No** |
| Add a new **backend** app | rare | One small nginx edit (root); rest no-root |
| Initial server setup | once | Yes |

The developer's entire day-to-day — and all static-app provisioning — is fully no-root, no shell, no box access. They only ever touch GitHub.

---

### Honest notes
- **Builds run on the droplet** alongside n8n/RocketChat. dasharc already does this fine; React builds are bursty but short. If a heavy app ever strains the box, we move that app's build to GitHub Actions (artifact-only) without changing anything else.
- **Backend isolation:** a dev's backend code runs as the `deploy` user — same trust level dasharc's own server runs at today. Fine for a trusted dev. If that ever changes, rootless Docker per backend is an additive swap, not a redo.
- **Private repos** need a read-only deploy key per repo (planned for; harmless if repos are public).

---

### Open items / next steps
- **Repo visibility:** private (needs deploy keys) or public (no pull auth)? — still to confirm.
- **Execution path:** (A) save design doc first [this doc], then execute in reviewed steps; or (B) start building now from the one-time root setup, pausing for confirmation between each prod-affecting step.
- **Webhook endpoint host:** `hooks.apps.rymare.com` — covered by the `*.apps.rymare.com` wildcard cert, so no extra cert.
