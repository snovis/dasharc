# How to deploy React apps on rymare.com + future steps for GitHub push-to-deploy

Written: 2026-06-04 10:26 · Context at save: ?%
Branch: chore/remove-firebase · Commit: 05dc786

## Content

### Goal

Give a dev the ability to deploy/upload React apps on the rymare.com droplet (like DashARC) **without root access**, instead of using Vercel. The droplet (`ssh rymare`, IP `64.23.243.220`) already runs n8n, Rocket Chat, DashARC, and Syncthing behind hand-configured nginx + certbot, so the solution must not disturb those.

### The approach chosen: non-root `deploy` user + narrow sudoers + `new-app` tool

Root is only actually needed for three things in this setup:
1. Writing nginx site configs (`/etc/nginx/...`)
2. Creating/reloading systemd units
3. Reading TLS certs / prod secrets (`/etc/letsencrypt`, `/etc/dasharc/env`)

Everything else — `git pull`, `npm ci`, `npm run build` into `dist/` — needs no root. So the trick: pre-build the per-app scaffolding as root once (the `new-app` tool), then let the dev do only the repeatable parts unprivileged.

### Droplet recon (state at setup time, 2026-06-04)

- **Everything runs as root** — including `dasharc-api` (`User=root`), n8n, Rocket Chat. Only root had a login shell.
- `/srv` was empty → clean home for `/srv/apps` (leaves root-owned `/opt` apps untouched).
- nginx serves 5 sites: dasharc, n8n, rocketchat, syncthing, default.
- `certbot 1.21.0`, `node v22.22.2`, `npm 10.9.7`, `systemctl` at `/usr/bin/systemctl`.
- DashARC nginx pattern: a port-80 server block + a 443 block with "managed by Certbot" lines (certbot adds 443 + http→https redirect when you run `certbot --nginx`).

### URL convention: subdomain-per-app

Following `dashboard.rymare.com`, a new app `amigo-player` lives at **`amigo-player.rymare.com`** — its own nginx site + its own TLS cert. Each app is a clean independent origin with its own cookie scope.

Rejected the path alternative (`rymare.com/amigo-player`): SPA routing gets messy under a sub-path (Vite `base`, asset rewrites, per-app `try_files`), and apps share a cookie/origin so they're less isolated.

Per-new-app steps:
1. **Cloudflare**: add DNS A record `amigo-player → 64.23.243.220` (grey cloud), let it propagate.
2. **nginx**: site config for `amigo-player.rymare.com` → serves `/srv/apps/amigo-player/dist` (+ `proxy_pass` to Express port if backend).
3. **certbot**: issues cert for that hostname.

Steps 2–3 are automated by `new-app.sh`.

### The security boundary the `deploy` user gives you

| Can do | Cannot do |
|---|---|
| SSH in as `deploy` | `sudo su` / become root |
| `git pull`, `npm ci`, `npm run build` anywhere under `/srv/apps/` | Read `/etc/dasharc/env` or any other app's secrets (640 root:root) |
| Restart services **named `app-*`** (his own apps) | Restart/reload nginx, n8n, rocketchat, **dasharc-api** |
| — | Edit nginx configs or systemd units |

The `app-*` naming convention is the whole trick: any app the dev can deploy gets a service named `app-<name>.service`. The `app-*` glob in sudoers matches a single unit token, so he can bounce his own apps but is locked out of everything not named that way. His apps' services run *as* the `deploy` user, so their env files live in `/srv/apps/<app>/.env` (he self-manages those) while real secrets stay root-only.

Standing up each **new** app (nginx site + systemd unit + TLS cert) still needs you-with-root one time — that's the `new-app.sh` helper, a ~30-second job. Then routine deploys are root-free.

### Script 1 — `setup-deploy-user.sh` (one-time, run as root; installed at /root/)

```bash
#!/usr/bin/env bash
# One-time, run as root on rymare. Creates an unprivileged `deploy` user that can
# build & deploy apps under /srv/apps and restart ONLY app-* services — nothing else.
#
# Usage:  setup-deploy-user.sh ["ssh-ed25519 AAAA... dev@laptop"]
#   - Pass the dev's SSH public key as the first arg to install it now.
#   - Omit it to create the account/workspace/sudoers and add the key later.
set -euo pipefail

DEPLOY_USER=deploy
APPS_ROOT=/srv/apps
DEV_PUBKEY="${1:-}"

# 1) Create the user — NOT in sudo group, own home, normal shell
id "$DEPLOY_USER" &>/dev/null || adduser --disabled-password --gecos "" "$DEPLOY_USER"

# 2) Install the dev's SSH public key (if provided)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -n "$DEV_PUBKEY" ]; then
  printf '%s\n' "$DEV_PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
  echo "Installed SSH key for $DEPLOY_USER."
else
  echo "NOTE: no SSH key installed. Add one later with:"
  echo "  echo 'PUBKEY' >> /home/$DEPLOY_USER/.ssh/authorized_keys && chown $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh/authorized_keys && chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys"
fi

# 3) App workspace the deploy user fully owns (git pull / npm ci / build all unprivileged)
install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APPS_ROOT"

# 4) The ENTIRE privilege grant: lifecycle of app-* units only.
#    Cannot touch nginx, n8n, rocketchat, dasharc-api, or run any other root command.
SYSTEMCTL="$(command -v systemctl)"
cat > /etc/sudoers.d/deploy <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: $SYSTEMCTL restart app-*, $SYSTEMCTL start app-*, $SYSTEMCTL stop app-*, $SYSTEMCTL status app-*
EOF
chmod 440 /etc/sudoers.d/deploy
visudo -cf /etc/sudoers.d/deploy   # validate; nonzero exit aborts the script

echo "OK. deploy user ready. Workspace: $APPS_ROOT"
```

### Script 2 — `new-app.sh` (installed at `/usr/local/sbin/new-app`, root tool)

```bash
#!/usr/bin/env bash
# Stand up a new app on rymare: <name>.rymare.com served from /srv/apps/<name>/dist,
# owned by the `deploy` user. Run as root. One-time per app.
#
# Usage:
#   new-app <name>                 # static SPA only (nginx serves dist/)
#   new-app <name> --port <PORT>   # SPA + Express backend on 127.0.0.1:PORT (systemd app-<name>)
#
# After this: the deploy user owns /srv/apps/<name> and can redeploy + restart app-<name>
# with no further root involvement.
set -euo pipefail

DROPLET_IP=64.23.243.220
DEPLOY_USER=deploy
BASE_DOMAIN=rymare.com

NAME="${1:-}"
PORT=""
if [ "${2:-}" = "--port" ]; then PORT="${3:-}"; fi

[ -n "$NAME" ] || { echo "usage: new-app <name> [--port <PORT>]"; exit 1; }
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]] || { echo "name must be lowercase alphanumeric/hyphens"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "run as root"; exit 1; }

DOMAIN="$NAME.$BASE_DOMAIN"
DIR="/srv/apps/$NAME"
SERVICE="app-$NAME"
SITE="/etc/nginx/sites-available/$NAME"

echo "==> App:     $NAME"
echo "==> URL:     https://$DOMAIN"
echo "==> Dir:     $DIR"
[ -n "$PORT" ] && echo "==> Backend: 127.0.0.1:$PORT  (systemd: $SERVICE)"
echo

# 0) DNS guard — certbot's HTTP-01 challenge needs the name pointing here first.
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1 || true)"
if [ "$RESOLVED" != "$DROPLET_IP" ]; then
  echo "WARNING: $DOMAIN resolves to '${RESOLVED:-nothing}', not $DROPLET_IP."
  echo "Add a Cloudflare DNS A record ($NAME -> $DROPLET_IP, grey cloud) and let it propagate first."
  read -rp "Continue anyway? [y/N] " ok; [ "$ok" = "y" ] || exit 1
fi

# 1) App dir owned by deploy, with a placeholder so nginx has something to serve.
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DIR" "$DIR/dist"
[ -f "$DIR/dist/index.html" ] || \
  install -m 644 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /dev/stdin "$DIR/dist/index.html" <<EOF
<!doctype html><meta charset=utf-8><title>$NAME</title>
<h1>$DOMAIN</h1><p>Provisioned. Deploy the build to $DIR/dist.</p>
EOF

# 2) nginx site (port 80 only; certbot adds the 443 block + http->https redirect).
{
  echo "server {"
  echo "    listen 80;"
  echo "    listen [::]:80;"
  echo "    server_name $DOMAIN;"
  echo
  echo "    root $DIR/dist;"
  echo "    index index.html;"
  echo
  if [ -n "$PORT" ]; then
    echo "    location /api/ {"
    echo "        proxy_pass http://127.0.0.1:$PORT;"
    echo "        proxy_http_version 1.1;"
    echo "        proxy_set_header Host \$host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "    }"
    echo
  fi
  echo "    location / {"
  echo "        try_files \$uri \$uri/ /index.html;"
  echo "    }"
  echo "}"
} > "$SITE"
ln -sf "$SITE" "/etc/nginx/sites-enabled/$NAME"

# 3) Backend service (runs as deploy, optional .env, restricted filesystem).
if [ -n "$PORT" ]; then
  cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=$NAME app server
After=network.target
Wants=network.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
WorkingDirectory=$DIR
EnvironmentFile=-$DIR/.env
ExecStart=/usr/bin/node $DIR/server/index.js
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DIR

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE" >/dev/null
  echo "Created systemd unit $SERVICE (start it after the first deploy: systemctl start $SERVICE)"
fi

# 4) Validate + reload nginx, then issue the cert (certbot rewrites the site for TLS).
nginx -t
systemctl reload nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect -m admin@"$BASE_DOMAIN" || {
  echo "certbot failed — site is live on http only. Re-run: certbot --nginx -d $DOMAIN"; exit 1; }

echo
echo "DONE. https://$DOMAIN is live (placeholder)."
echo "Hand off to the dev:"
echo "  - workspace: $DIR  (owned by $DEPLOY_USER)"
echo "  - deploy:    build into $DIR/dist"
[ -n "$PORT" ] && echo "  - restart:   sudo systemctl restart $SERVICE"
```

### What was actually executed on the droplet (2026-06-04)

```bash
# Copied both scripts up; installed new-app as a permanent root tool:
scp /tmp/setup-deploy-user.sh /tmp/new-app.sh rymare:/root/
ssh rymare 'install -m 750 /root/new-app.sh /usr/local/sbin/new-app && chmod +x /root/setup-deploy-user.sh'
# → installed: /usr/local/sbin/new-app

# Ran deploy-user setup WITHOUT a key (key deferred until dev provides it):
ssh rymare 'bash /root/setup-deploy-user.sh'
```

Verified results:
- `id deploy` → `uid=1000(deploy) gid=1000(deploy) groups=1000(deploy)` (NOT in sudo group)
- `/srv/apps` → owned `deploy:deploy`
- `/etc/sudoers.d/deploy` → `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart app-*, /usr/bin/systemctl start app-*, /usr/bin/systemctl stop app-*, /usr/bin/systemctl status app-*` (`parsed OK`)

### Remaining step to make the account usable

The account is created but locked — **no SSH key installed yet**. To finish, paste the dev's public key (`cat ~/.ssh/id_ed25519.pub` on his machine) and install it:
```bash
echo 'PUBKEY' >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```
Dev tests with: `ssh deploy@dashboard.rymare.com 'id; ls -la /srv/apps'` (any rymare.com hostname works — same droplet).

### Provisioning a new app (e.g. amigo-player)

```bash
# 1. Cloudflare: add A record  amigo-player -> 64.23.243.220  (grey cloud), let it propagate
# 2. Then:
ssh rymare 'new-app amigo-player'              # static SPA  → https://amigo-player.rymare.com
ssh rymare 'new-app amigo-player --port 4200'  # SPA + Express backend (systemd app-amigo-player)
```

### Future step: GitHub Actions push-to-deploy (NOT yet built)

The Vercel-like finish so the dev never SSHes manually. A GitHub Action on push runs the deploy as the restricted `deploy` user:

```yaml
# .github/workflows/deploy.yml — runs on push to main
- run: ssh deploy@rymare.com 'cd /srv/apps/app-foo && git pull && npm ci && npm run build && sudo systemctl restart app-foo'
```

with the `deploy` private key stored in the GitHub repo secrets. Push → live, with logs, just like Vercel — but on your droplet, and the blast radius is still just that one restricted account.

### Alternative considered but deferred: self-hosted PaaS (Coolify / Dokku)

Gives previews-per-PR + a deploy dashboard + dev login with limited role. Catch: Coolify wants to own the reverse proxy (Traefik/its own nginx + Docker), which conflicts with the hand-configured nginx already serving n8n / Rocket Chat / DashARC. If pursued, run it on a **fresh droplet**, not the existing one. Recommendation was to start with the `deploy` user + sudoers + GitHub Actions, and only reach for Coolify-on-a-second-droplet if spinning up apps becomes frequent enough that the per-app root step is annoying.
