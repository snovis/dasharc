# Walk: n8n → Firebase Bridge Plan

Started: 2026-04-22 11:01 · Branch: n8n-firebase-bridge · Start commit: 6c3ca34
Status: closed (superseded by Synthflow direct-API pivot)
Totals: 8 items · 1 done · 0 rejected · 7 deferred · 0 modified · 0 unresolved

<!--
A walk is a living tasklist. Items are resolved one at a time via /rsd:next.
After each resolution, remaining items may be flagged for re-check if the fix
affected them. Flags are surfaced in chat and recorded inline, not auto-edited.
-->

## Items

### 1. Lock the data contract — done

**Recommendation**
Write `docs/FIRESTORE_SCHEMA.md` pinning down:
- The `calls/{callId}` document shape (all fields, types, required vs optional)
- Synthflow status → our outcome mapping (`completed` → `Connected`, `hangup_on_voicemail` → `Voicemail`, etc.)
- The initiator payload vs. post-call payload shapes
- Firestore security rule
- Sample documents

Everything downstream depends on this. Show Scott before building against it.

**Discussion**
Scott's clarification: "No Value" === Failed for MVP. Folded into the status taxonomy section of the doc — they're one bucket, with a note to add a sub-status later if granularity is requested.

Schema commits to a `calls/{call_id}` primary key using Synthflow's `call_id`, with a noted fallback to a UUID-in-custom-variable if Synthflow's `POST /v2/calls` response doesn't include it (first n8n test run decides). Security rule drafted with placeholders for `<INGEST_USER_UID>` (filled during item 5) and assumes an `authorized_users/{uid}` Firestore collection for the reader allowlist (design finalized in item 4).

**Resolution**
done · Schema doc drafted at docs/FIRESTORE_SCHEMA.md (215 lines). Scott reviewed and approved. "No Value" clarification folded in.

### 2. Build the ingest function — deferred

**Recommendation**
- `/api/ingest.js` — Vercel serverless, Firebase client SDK, signs in as ingest user, merge-writes to Firestore
- Small local harness to POST fake payloads so we can verify before n8n is wired up
- Minimal `package.json` changes (add a couple deps if needed)

**Discussion**
Built to completion before the pivot landed: `api/ingest.js`, `scripts/test-ingest.mjs`, `.env.example` updates, `eslint.config.js` Node-env addition, `package.json` test script. Syntax + lint + build verified. Not verified against a live Firebase project — we never reached that step.

**Resolution**
deferred · Code is committed (see commit c78ad2d) but unused. Substantial chunks are reusable in the new Synthflow-direct branch: the Firebase Auth sign-in pattern, status mapping, and `setDoc({merge:true})` mechanics all carry over. Payload duality and X-Ingest-Secret auth layer are dead weight in the new model. Revisit when designing the polling sync function.

### 3. Wire the frontend to real Firestore — deferred

**Recommendation**
- Fill in the Firestore queries in `src/hooks/useCallData.js` (the TODOs that are already marked)
- Pivot grouping from "agent" to "campaign" — rename `AgentDetailPage` → `CampaignDetailPage`, update routes, update chart axis labels
- Drop the "No value" bucket from chart colors/data
- Keep mock mode intact so we don't break the current deploy

**Discussion**

**Resolution**
deferred · Still needed, just in the new branch. Firestore doc shape is unchanged, so the queries and campaign-axis pivot carry over verbatim. No work here was done — carry forward as-is.

### 4. Migrate auth to Google OAuth + allowlist — deferred

**Recommendation**
Replace the email/password LoginPage with a "Sign in with Google" button (Firebase Auth Google provider). Add an authorized-email allowlist so only approved users (Jason, Scott, Ember) can see the report — anyone else gets signed out with a "not authorized" message.

Design decision still open inside this item: store the allowlist as a Firestore collection (editable without a redeploy) vs. a hardcoded env var (simpler, needs redeploy to change). Settle when we get to it.

**Discussion**

**Resolution**
deferred · Still needed in the new branch. Completely independent of the data-source pivot. The flag raised during item 1 amend pass still applies — the schema doc's security rule assumes Firestore-collection allowlist; reconcile when picking up this item. Carry forward as-is.

### 5. Firebase setup (Scott does, Claude walks through) — deferred

**Recommendation**
- Create the Firebase project (if not done yet)
- Create `ingest@dasharc.internal` user → copy UID
- Enable Google OAuth provider in Firebase Auth
- Paste the Firestore security rule (writes locked to ingest UID, reads locked to allowlisted users)
- Add a web app → copy `firebaseConfig` into `.env` locally AND into Vercel env vars

**Discussion**

**Resolution**
deferred · Still needed in the new branch. The ingest user is probably still the right mechanism — the sync function running on Vercel needs *some* Firebase identity to write to Firestore, and a dedicated auth user is still the simplest answer. Carry forward mostly as-is.

### 6. Vercel env + deploy (Scott does, Claude walks through) — deferred

**Recommendation**
- Add `INGEST_EMAIL`, `INGEST_PASSWORD`, `INGEST_SECRET` (Claude generates the secret)
- Add the `VITE_FIREBASE_*` vars
- Set `VITE_USE_MOCK_DATA=false`
- Trigger a redeploy

**Discussion**

**Resolution**
deferred · Env vars mostly still apply in new branch, but: `INGEST_SECRET` is likely unnecessary (no external caller), and we'll gain a `SYNTHFLOW_API_KEY` and `VERCEL_CRON_SECRET` (or similar) in its place. Carry forward with edits.

### 7. n8n edits (Scott does, Claude gives exact node configs) — deferred

**Recommendation**
- Post-call workflow: HTTP Request node in parallel with SF PATCH → POSTs to `/api/ingest`
- Initiator workflow: HTTP Request node after Synthflow API success → POSTs to `/api/ingest`
- Test with the `Limit 2 TEST` node

**Discussion**

**Resolution**
deferred · Killed by the pivot. No n8n changes needed — the whole point of polling Synthflow directly is that we stop depending on the client's n8n instance. Do NOT carry forward; the new branch replaces this item with a Vercel cron job.

### 8. End-to-end verification (together) — deferred

**Recommendation**
- Run the initiator manually with 2 contacts
- Watch Firestore for docs appearing
- Open the dashboard, confirm they show up

**Discussion**

**Resolution**
deferred · Still needed in the new branch but shape changes: instead of "run n8n manually," we'll manually trigger the Vercel cron function (or wait for its first scheduled run) and watch Firestore + dashboard. Conceptually the same verification, different trigger.

## Flags

<!--
Amend-pass notes surface here when a resolution on one item affects another.
Format: `item N: why flagged · raised after item M resolved`.
Never auto-rewrites items; just a heads-up for when we get there.
-->

- item 4: schema doc's security rule pre-assumes the `authorized_users/{uid}` Firestore-collection approach for the allowlist. Item 4 still lists env-var vs. Firestore as an open design choice — when resolving, confirm Firestore-collection approach or revise the schema's security rule. · raised after item 1 resolved

## Summary

**Closed early due to architecture pivot** — mid-walk (after item 2 was built), Scott discovered that Synthflow exposes a direct API returning all the call data we were trying to sniff from n8n workflows. That obsoletes most of this plan.

**Outcome: 1 done, 7 deferred, 0 rejected, 0 modified.**

- **Item 1 (schema)** — done. Doc shape is source-agnostic; survives the pivot intact.
- **Item 2 (ingest function)** — built to completion and committed, but unused. ~75% of the code is reusable in the new branch (auth pattern, status mapping, merge-write). The HTTP-ingress and initiated/completed payload duality are dead weight in a polling model.
- **Items 3, 4, 5, 6, 8** — still relevant; carry forward to new branch with minor edits noted in each resolution.
- **Item 7 (n8n edits)** — killed outright. The whole point of the pivot is to stop depending on the client's n8n instance.

**Lessons:**

1. **Ask about API availability earlier.** We spent ~4 commits designing a bridge that would be unnecessary if we'd asked "does Synthflow have a reporting API?" before building. Worth adding to the open-questions checklist for future integrations.
2. **The schema-first discipline paid off.** Even though the *transport* changed completely, the schema doc from item 1 is 100% reusable. The 30 minutes we spent pinning the doc shape saved hours of re-design.
3. **Amend flags worked.** The flag raised on item 4 during item 1's amend pass (security rule pre-assumption) is still relevant in the new branch — it travels with the deferred item cleanly.

**Follow-up:**

- See `.rsd/docs/2026-04-22-1140-pivot-to-synthflow-direct.md` for the pivot rationale, what survives, and open questions for the new branch.
- New branch name pending — Scott's pick: `synthflow-direct` or `synthflow-api-sync`.
- Consider cherry-picking `docs/FIRESTORE_SCHEMA.md` to `main` before starting the new branch so the schema lives on the trunk.
