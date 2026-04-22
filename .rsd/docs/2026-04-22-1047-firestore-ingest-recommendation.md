# Firestore Ingest Recommendation

Written: 2026-04-22 10:47 · Context at save: (unknown)
Branch: n8n-firebase-bridge · Commit: 2697d3e

## Content

My recommendation: **add a single Vercel serverless function to the DashARC repo** that n8n POSTs to. Here's why it beats the alternatives for your situation.

## Option I recommend: Vercel serverless function

Add one file — `/api/ingest.js` — to the DashARC repo. n8n sends clean JSON with a shared-secret header. The function validates, shapes it, and writes to Firestore via the Firebase Admin SDK.

**Why this over a Firebase Cloud Function:**
- **No new infrastructure.** You already have the Vercel project connected. Adding `/api/` to a Vite app is zero-config — Vercel auto-detects.
- **No new deploy flow.** `git push` → Vercel rebuilds frontend + function together. Same pipeline you already use.
- **No Blaze billing plan required.** Firebase Cloud Functions requires the pay-as-you-go "Blaze" plan. Writing to Firestore *from anywhere else* (including Vercel) works on the free Spark plan. One less bill.
- **Code lives in the DashARC repo** — version controlled, reviewable, same codebase as the frontend that reads the data. When the Firestore schema changes, it's a normal PR.
- **You already know Vercel.** Zero new tooling to learn.

**Why this over hitting Firestore REST directly from n8n:**
- Firestore's REST API uses a clunky typed-value format (`{"stringValue": "foo"}`, `{"integerValue": "5"}`) — the JSON body templates in n8n would be ugly and fragile.
- Credentials would live on the **client's** n8n instance (`salesarcsolutions.app.n8n.cloud`) — Firebase service account JSON is more sensitive than a shared secret. Better to keep real creds on infra you fully control (Vercel) and give n8n only a rotation-friendly header value.
- Schema evolution requires editing n8n workflows on someone else's instance vs. a git commit in this repo. Much worse ergonomics over time.

## What it looks like end-to-end

```
n8n (initiator workflow)
  ├─ after Synthflow API call succeeds
  └─ HTTP POST → https://dasharc.vercel.app/api/ingest
     headers: X-Ingest-Secret: <shared secret from Vercel env>
     body: { type: "initiated", call_id, campaign, phone, leadId, ... }

n8n (post-call workflow)
  ├─ in parallel with existing SF PATCH
  └─ HTTP POST → https://dasharc.vercel.app/api/ingest
     headers: X-Ingest-Secret: <same secret>
     body: { type: "completed", call_id, status, duration, transcript,
             recording_url, ... }

/api/ingest.js (Vercel)
  ├─ verify X-Ingest-Secret matches env var → else 401
  ├─ validate payload shape
  ├─ map Synthflow status → our outcome taxonomy
  └─ firestore.doc(`calls/${call_id}`).set(payload, { merge: true })
```

## What you'd need to set up (one-time)

1. **Firebase service account** — in Firebase console → Project Settings → Service Accounts → Generate new private key. You get a JSON file.
2. **Store it in Vercel env vars** — paste the JSON as a single env var (`FIREBASE_ADMIN_CREDENTIALS`).
3. **Generate a shared secret** — any random string. Store in both Vercel env (`INGEST_SECRET`) and n8n credentials.
4. **Add the `api/` directory + function** — I write it.
5. **Add two HTTP Request nodes to n8n** — one per workflow. Straightforward n8n edit.

Estimated setup: 30 min of clicks from you, and I write the function + design doc.
