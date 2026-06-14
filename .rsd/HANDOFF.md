# Handoff: react-dev-deploy-design

Branch: main · Commit: 7659a5e

## What we're working on

Designing (not yet building) a Vercel-like, **no-root** deploy flow so an external developer can deploy React apps under `*.apps.rymare.com` on Scott's existing DigitalOcean droplet — alongside the running dasharc / n8n / Rocket Chat services, without disrupting them.

## What just happened

- Wrote the full design doc → `.rsd/docs/2026-06-13-2113-react-development-design-document.md` (committed b7a40e8, updated 7659a5e). Verified present + pushed to origin/main.
- Locked these decisions with the user (see below). All pushed; `git status` clean.
- No infrastructure touched yet — this session was design only. Nothing has been created on the droplet.

## What's open

**Only one fork left: execution path.** The design is fully specified; we have NOT started building.

Next likely action — begin the one-time root setup on the droplet (`ssh rymare`), pausing for user confirmation between each prod-affecting step, in this order:
1. Non-destructive recon first: confirm `ssh rymare` works, inspect current nginx layout (`/etc/nginx/sites-enabled/`), check certbot + `dns-cloudflare` plugin availability, confirm Cloudflare API token access.
2. Create `deploy` system user (no sudo, no login shell); `loginctl enable-linger deploy`; own `/srv/apps`, `/srv/repos`, `/srv/deploy`.
3. Wildcard DNS `*.apps.rymare.com` → droplet IP (Cloudflare, grey-cloud / DNS-only).
4. Wildcard cert via `certbot --dns-cloudflare -d '*.apps.rymare.com'` (also covers `hooks.apps.rymare.com`).
5. Wildcard nginx vhost (`server_name *.apps.rymare.com`, map subdomain→`/srv/apps/<app>/current/dist`, SPA fallback) + `hooks.apps.rymare.com` → proxy to listener.
6. Build the deploy-listener (signed GitHub webhook receiver, ~100 lines Node, runs as `deploy`).

Full detail (architecture diagram, root-vs-no-root table, per-app onboarding steps) is in the design doc — read it first on resume.

## Recent decisions (2026-06-13)

- **Extend the existing nginx stack; do NOT install a PaaS** (Dokku/CapRover/Coolify). Why: a PaaS wants ports 80/443 + its own reverse proxy → would force re-fronting n8n/RocketChat/dasharc. Too much blast radius for a UI we don't need.
- **GitHub as source of truth + auto-deploy via push webhook.** Builds run **on the droplet** (matches dasharc). Why: keeps dev in normal git workflow, no GitHub-side build secrets.
- **Wildcard subdomain `*.apps.rymare.com` + one wildcard TLS cert** (Cloudflare DNS-01). Why: new *static* apps then need zero root and zero cert work.
- **Repos are private.** Droplet pulls via **per-repo read-only deploy key**. Developer is a **GitHub contributor** (push rights) on each repo — entirely GitHub-side, never touches the droplet. Two distinct creds: dev write (GitHub) vs droplet read (deploy key).
- **dasharc is NOT pure static** — clarified for the user: its `dist/` is static but `server/` is a live process holding `SYNTHFLOW_API_KEY`. Secrets can't live in a browser bundle → any secret/auth app needs a backend process. Static→backend growth is additive (add systemd --user service + one proxy_pass), not a redo.

## Open threads

- Backend isolation: dev's backend code would run as the `deploy` user (same trust level as dasharc's own server today). Fine for a trusted dev; if ever untrusted, move backends to rootless Docker — additive, not a redo. Deferred until first backend app exists.
- Adding a new *backend* app needs one small root nginx edit (the only recurring root touch); static apps + all redeploys are fully no-root. Could later make backend provisioning zero-root via a socket-naming convention if it becomes friction.
- Heavy builds straining the box (shared with n8n/RocketChat) → fallback is moving that app's build to GitHub Actions (artifact-only). Not needed now.
