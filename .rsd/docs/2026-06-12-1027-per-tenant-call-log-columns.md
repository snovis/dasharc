# Design: per-tenant call log columns

Written: 2026-06-12 10:27 · Context at save: unknown%
Branch: main · Commit: a213686

## Content

## Design: per-tenant call log columns

**Where the config lives.** The account entry in `accounts.yaml` — that's already the tenant boundary, it's already read at startup by `server/config.js`, and it already flows to the browser via `/api/me` → `useMe` → `useSelection().account`. No new plumbing needed, just a new field:

```yaml
accounts:
  onboard-360:
    name: Onboard 360
    agents: [...]
    call_log_columns:
      - key: industry
        label: Industry
        source: prompt_variables.industry   # dot-path into the sanitized call object
```

**Server side.** `loadConfig()` validates each spec at startup (label is a string, `source` matches `^[\w.]+$`, rejects `__proto__`/`constructor` segments) — invalid entries are warned and dropped, consistent with how unknown account refs are handled today. `resolveUserAccess()` includes `call_log_columns` (default `[]`) in each account object, so `/api/me` carries it automatically. Important property: a user only ever receives column configs for accounts they're granted — tenant A's config never reaches tenant B's browser.

**Frontend.** `AgentDetailPage` builds its column list as base columns + `account.call_log_columns` (inserted after Duration, before Media), rendering each via a small dot-path resolver that only reads own-properties and falls back to `—`. The hardcoded Industry column **gets deleted** — it becomes a YAML entry on the Onboard 360 account. Since `useSelection` is already URL/selection-driven, a support user switching accounts re-renders the right columns for free.

**Deliberately dumb v1:** no formatters, no per-agent overrides, no column reordering. `source` can only read what the server already sends — the sanitizer in `server/routes/calls.js` remains the security boundary, not this config. Per-agent overrides are a plausible v2 if one account's agents diverge, but the account is the right default boundary.

## What has to FAIL to prove it works

The design's whole claim is *isolation*, so the proof is mostly in absences:

1. **Cross-tenant leak test (the core one):** sign in as a user with access only to an account *without* `call_log_columns` → the Industry column must fail to appear. If it renders (even with dashes), the design failed.
2. **Selection-switch test:** as the wildcard support user, select Onboard 360 (column appears), then switch accounts → the column must disappear immediately. If it lingers, columns aren't actually keyed to selection.
3. **API leak test:** `GET /api/me` as a single-tenant user must fail to contain any other account's column config in the raw JSON — checked at the API, not the UI, since UI absence can mask a payload leak.
4. **Hostile config test:** a spec with `source: __proto__.x` or `source: constructor.prototype.y` must fail validation at startup (warned + dropped), and a runtime probe through the resolver must return undefined — never pollute or throw.
5. **Sanitizer boundary test:** a column pointing at a server-stripped field (e.g. `telephony_sip_headers.foo`) must render `—` — proving the column config can't widen what data reaches the browser.
6. **Bad-path resilience:** a typo'd `source` (field that exists on no call) must render dashes, never white-screen the table; a malformed spec (missing `label`) must not prevent server boot.
7. **Regression guard:** an account with no `call_log_columns` key renders a table byte-identical to today's (minus the hardcoded Industry column).

Mechanically: the repo has no test framework, so I'd add a minimal vitest setup covering `loadConfig` validation (tests 4, 6) and the path resolver, then run tests 1–3 manually against `npm run dev:api` with a two-account `accounts.local.yaml` — one account configured, one not, plus your wildcard user to flip between them. Tests 5 and 7 are quick manual checks in the same session.

One deployment note: this changes the droplet's `/etc/dasharc/accounts.yaml` (add the column to Onboard 360's account) and requires a `systemctl restart dasharc-api` since config is startup-only.
