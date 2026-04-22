# Pivot: From n8n Bridge to Synthflow Direct API

Written: 2026-04-22 11:40 · Context at save: (unknown)
Branch: n8n-firebase-bridge · Commit: c78ad2d

## Content

### Why we're pivoting

We designed and started building a bridge that would sniff the two n8n workflows (initiator + post-call) to capture call data into Firestore for the dashboard. Mid-implementation (after item 2 of the walk), Scott discovered that **Synthflow.ai exposes a direct API that returns all the call data we need** — statuses, durations, transcripts, recording URLs, the lot.

That collapses most of the bridge architecture. Instead of:

```
Synthflow → n8n (initiator) → /api/ingest → Firestore
Synthflow → n8n (post-call) → /api/ingest → Firestore
```

…we can go:

```
Synthflow API ←(poll/sync)— Vercel cron → Firestore
```

Cleaner. No n8n edits on the client's instance. No dual-write sync problem. No orphan detection needed. Firestore's state mirrors Synthflow's.

### What we killed (and why it was the right call)

- The dual-workflow n8n integration (initiator + post-call HTTP nodes)
- The initiated/completed payload duality in `/api/ingest`
- Merge-semantics on `calls/{call_id}` for race-condition safety — irrelevant when there's a single authoritative writer
- The orphan detection logic ("doc stuck on initiated > 10 min")
- The X-Ingest-Secret shared-secret dance between two infrastructure owners

### What survives the pivot

- **`docs/FIRESTORE_SCHEMA.md`** — ~100% reusable. The `calls/{callId}` doc shape is source-agnostic. The status mapping and taxonomy all still apply. Worth cherry-picking to `main` before the new branch starts.
- **`api/ingest.js`** — ~75% reusable. The Firebase Auth sign-in pattern, status mapping, and merge-write logic carry over. What changes: no HTTP ingress, no secret-header check, no initiated/completed split — just a cron-triggered function that pulls from Synthflow and writes.
- **`scripts/test-ingest.mjs`** — moderately reusable. The shape of sample documents is still valid; the POST mechanism needs to change to "call the sync function directly" or "invoke the cron path manually."
- **`.rsd/docs/2026-04-22-1009-project-analysis.md`** — keeps the reasoning about the "agents" pivot (campaign as primary axis), which is still correct regardless of data source.
- **`.rsd/walks/2026-04-22-1101-n8n-firebase-bridge-plan.md`** — preserved as a historical artifact. Items 1 (schema) stays done; items 2–8 deferred with this pivot as the cause.

### What the new branch needs to figure out

1. **Synthflow API shape** — does it support "calls since timestamp" filtering, or do we paginate all calls? Determines whether we need a checkpoint mechanism.
2. **Polling cadence** — Vercel cron minimum is ~1 min. Dashboard freshness requirement is likely "within 10 min of call completion." Probably 5–10 min cron.
3. **Vercel cron config** — `vercel.json` needs a `crons` entry; function signature becomes `/api/sync-calls.js` (or similar) and gets invoked by Vercel's scheduler, not external HTTP.
4. **Idempotency** — the polling function will re-see already-synced calls. Either dedupe by `call_id` before write, or trust `setDoc({merge: true})` on the same key to be a no-op.
5. **Auth to Synthflow** — we have the API key in the existing n8n workflow (`"Synthflow API"` credential, id `Ef4OuEgEIr9rpFgd`). Scott needs to grab that value and put it in Vercel env.
6. **Does this kill the n8n dependency entirely**, or does Synthflow-initiated-from-n8n still need to happen (i.e., is the n8n side still responsible for *initiating* calls, just not for reporting outcomes)?

### Suggested new branch name

`synthflow-direct` or `synthflow-api-sync` — Scott's pick.

### Close-out steps being executed

1. This pivot note (you're reading it).
2. Walk items 2–8 marked `deferred` with pivot pointer.
3. Walk `## Summary` filled in.
4. Commit + push branch with `-u origin n8n-firebase-bridge`.
5. Switch back to main, start the new branch.
