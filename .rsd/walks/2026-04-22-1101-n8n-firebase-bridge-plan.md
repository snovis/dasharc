# Walk: n8n → Firebase Bridge Plan

Started: 2026-04-22 11:01 · Branch: n8n-firebase-bridge · Start commit: 6c3ca34
Status: in progress
Totals: 8 items · 0 done · 0 rejected · 0 deferred · 0 modified · 8 unresolved

<!--
A walk is a living tasklist. Items are resolved one at a time via /rsd:next.
After each resolution, remaining items may be flagged for re-check if the fix
affected them. Flags are surfaced in chat and recorded inline, not auto-edited.
-->

## Items

### 1. Lock the data contract — unresolved

**Recommendation**
Write `docs/FIRESTORE_SCHEMA.md` pinning down:
- The `calls/{callId}` document shape (all fields, types, required vs optional)
- Synthflow status → our outcome mapping (`completed` → `Connected`, `hangup_on_voicemail` → `Voicemail`, etc.)
- The initiator payload vs. post-call payload shapes
- Firestore security rule
- Sample documents

Everything downstream depends on this. Show Scott before building against it.

**Discussion**

**Resolution**

### 2. Build the ingest function — unresolved

**Recommendation**
- `/api/ingest.js` — Vercel serverless, Firebase client SDK, signs in as ingest user, merge-writes to Firestore
- Small local harness to POST fake payloads so we can verify before n8n is wired up
- Minimal `package.json` changes (add a couple deps if needed)

**Discussion**

**Resolution**

### 3. Wire the frontend to real Firestore — unresolved

**Recommendation**
- Fill in the Firestore queries in `src/hooks/useCallData.js` (the TODOs that are already marked)
- Pivot grouping from "agent" to "campaign" — rename `AgentDetailPage` → `CampaignDetailPage`, update routes, update chart axis labels
- Drop the "No value" bucket from chart colors/data
- Keep mock mode intact so we don't break the current deploy

**Discussion**

**Resolution**

### 4. Migrate auth to Google OAuth + allowlist — unresolved

**Recommendation**
Replace the email/password LoginPage with a "Sign in with Google" button (Firebase Auth Google provider). Add an authorized-email allowlist so only approved users (Jason, Scott, Ember) can see the report — anyone else gets signed out with a "not authorized" message.

Design decision still open inside this item: store the allowlist as a Firestore collection (editable without a redeploy) vs. a hardcoded env var (simpler, needs redeploy to change). Settle when we get to it.

**Discussion**

**Resolution**

### 5. Firebase setup (Scott does, Claude walks through) — unresolved

**Recommendation**
- Create the Firebase project (if not done yet)
- Create `ingest@dasharc.internal` user → copy UID
- Enable Google OAuth provider in Firebase Auth
- Paste the Firestore security rule (writes locked to ingest UID, reads locked to allowlisted users)
- Add a web app → copy `firebaseConfig` into `.env` locally AND into Vercel env vars

**Discussion**

**Resolution**

### 6. Vercel env + deploy (Scott does, Claude walks through) — unresolved

**Recommendation**
- Add `INGEST_EMAIL`, `INGEST_PASSWORD`, `INGEST_SECRET` (Claude generates the secret)
- Add the `VITE_FIREBASE_*` vars
- Set `VITE_USE_MOCK_DATA=false`
- Trigger a redeploy

**Discussion**

**Resolution**

### 7. n8n edits (Scott does, Claude gives exact node configs) — unresolved

**Recommendation**
- Post-call workflow: HTTP Request node in parallel with SF PATCH → POSTs to `/api/ingest`
- Initiator workflow: HTTP Request node after Synthflow API success → POSTs to `/api/ingest`
- Test with the `Limit 2 TEST` node

**Discussion**

**Resolution**

### 8. End-to-end verification (together) — unresolved

**Recommendation**
- Run the initiator manually with 2 contacts
- Watch Firestore for docs appearing
- Open the dashboard, confirm they show up

**Discussion**

**Resolution**

## Flags

<!--
Amend-pass notes surface here when a resolution on one item affects another.
Format: `item N: why flagged · raised after item M resolved`.
Never auto-rewrites items; just a heads-up for when we get there.
-->

## Summary

<!-- Written by /rsd:walk-done. Empty while the walk is in progress. -->
