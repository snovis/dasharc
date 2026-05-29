---
name: add-dashboard-user
description: Use when adding, removing, or changing a user's access to a DashARC dashboard (account) — e.g. "add X to the dashboard", "give dan@ access to onboard-360", "new user for OnSite Medical", "revoke Y". Encodes the safe production procedure (backup → insert → validate → restart → verify) so prod edits stay boring.
---

# Add / manage a DashARC dashboard user

Users and their account access live in a YAML config. There is **no database** and **no env-var allowlist** for this — the YAML `users:` list is authoritative.

- **Production (authoritative):** `/etc/dasharc/accounts.yaml` on the droplet (`ssh rymare`). Gitignored, mode `640 root:root`. **Editing this file + restarting the API is the only thing that actually grants access.**
- **Repo dev config:** `config/accounts.local.yaml` (gitignored, local dev only). Often lags prod — update it for parity but it changes nothing in production.
- Config is read **once at startup** — every change needs `systemctl restart dasharc-api`.

## A user entry

```yaml
  - email: someone@clientco.com
    accounts: [onboard-360]        # one or more EXISTING account IDs, OR ["*"]
    # role: support                # optional: support | admin (support shows a badge)
```

- Email is lowercased on load; case doesn't matter.
- `accounts` must reference IDs that exist under `accounts:` — unknown IDs are silently ignored (the user sees nothing).
- `["*"]` grants every account (use for SalesARC support/admin only).

## Before you touch prod: confirm access scope

Granting the wrong `accounts` exposes one tenant's call data to another. **Never guess.** Confirm with the user exactly which account ID(s) each email gets. Don't infer from the email domain alone — propose, then get a yes.

Check current accounts/users first:
```bash
ssh rymare 'cat /etc/dasharc/accounts.yaml'
```

## Procedure

### 1. (Optional) Update the repo dev config for parity
Edit `config/accounts.local.yaml` so local dev matches. This does NOT affect production.

### 2. Apply to the droplet — backup + idempotent insert
Adapt the `NEW` list. The script backs up, skips emails already present, appends to the `users:` list (order doesn't matter), and refuses if nothing changes.

```bash
ssh rymare 'python3 -' <<'PYEOF'
import shutil, datetime, sys
# (email, "[account-id]" or '["*"]', role_or_None)
NEW = [
    ("dan@oneteam360.com",  "[onboard-360]", None),
    ("dave@oneteam360.com", "[onboard-360]", None),
]
path = '/etc/dasharc/accounts.yaml'
s = open(path).read()
add = [(e, a, r) for (e, a, r) in NEW if e not in s]
if not add:
    print('SKIP: all listed emails already present — no change')
    sys.exit(0)
block = ''
for email, accounts, role in add:
    block += f'\n  - email: {email}\n    accounts: {accounts}\n'
    if role:
        block += f'    role: {role}\n'
bak = path + '.bak-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
shutil.copy2(path, bak)
open(path, 'w').write(s.rstrip('\n') + '\n' + block)
print('backup written:', bak)
print('added:', ', '.join(e for e, _, _ in add))
PYEOF
```

To **remove or change** a user, edit by hand (`ssh rymare 'nano /etc/dasharc/accounts.yaml'`) after backing up — there's no scripted removal.

### 3. Validate the file parses BEFORE restarting
A bad YAML restart takes the API down. Validate with the droplet's own `yaml` dep (the project is ESM, so force CommonJS):

```bash
ssh rymare 'cd /opt/dasharc && node --input-type=commonjs -e "
const y=require(\"yaml\");const fs=require(\"fs\");
const c=y.parse(fs.readFileSync(\"/etc/dasharc/accounts.yaml\",\"utf8\"));
console.log(\"accounts:\",Object.keys(c.accounts).join(\", \"));
console.log(\"users:\",c.users.length);
c.users.forEach(u=>console.log(\"  \"+u.email+\" -> \"+JSON.stringify(u.accounts)+(u.role?\" (\"+u.role+\")\":\"\")));
"'
```
Confirm the new users show the intended accounts. If this errors, **do not restart** — restore the backup:
`ssh rymare 'cp /etc/dasharc/accounts.yaml.bak-<ts> /etc/dasharc/accounts.yaml'`

### 4. Restart + verify
```bash
ssh rymare 'systemctl restart dasharc-api && sleep 1 && systemctl is-active dasharc-api && curl -s http://127.0.0.1:4100/api/health && echo && journalctl -u dasharc-api -n 3 --no-pager'
```
Expect `active`, a health JSON with the new `users` count, and a startup log line `Loaded config from /etc/dasharc/accounts.yaml: N accounts, M users`.

### 5. Tell the user
- They sign in at https://dashboard.rymare.com via Google (or Microsoft if that's their provider). No other provisioning — their OAuth origin is already authorized.
- If they get a 403 after signing in, the email in the config doesn't match the one they signed in with (typo / different domain).
- This is a backend/config change, **not** a frontend deploy — no browser hard-refresh needed.

## Notes
- Adding a brand-new **account** (not just a user) is a superset: add an `accounts:` block (name, branding, agents, optional `demo_trigger_url`), then grant users — same restart/verify steps. See CLAUDE.md "Adding a New Account".
- Droplet ops reference (paths, systemd, nginx) is in CLAUDE.md "Deployment".
