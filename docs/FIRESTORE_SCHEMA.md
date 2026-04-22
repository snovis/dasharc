# Firestore Schema — DashARC `calls` collection

Pins the contract between n8n workflows (writers) and the DashARC frontend (readers).

## Collection: `calls/{callId}`

One document per phone call attempt. Created by the initiator workflow when Synthflow accepts the dial request; merged with outcome data when the post-call webhook fires.

### Document ID strategy

**Primary:** Synthflow's `call_id`, extracted from the post-call webhook payload (`body.call.call_id`).

**Assumption to verify:** that Synthflow's `POST /v2/calls` response also returns `call_id` — if so, the initiator uses it directly. If the sync response does *not* include it, we fall back to generating a UUID in the initiator workflow and passing it as a `custom_variable` (`dasharc_call_id`) that Synthflow echoes back in the webhook. First n8n test run will tell us which path we're on. The ingest function accepts either shape.

### Fields

| Field | Type | Written by | Required | Notes |
|---|---|---|---|---|
| `callId` | string | initiator | ✓ | Redundant with doc ID — included for query convenience |
| `phone` | string | initiator | ✓ | E.164 format (e.g. `+16025551234`) |
| `campaign` | string | initiator | ✓ | Currently `AZ_CrossSell` or `TX_ColdOutreach` |
| `status` | string | both | ✓ | See taxonomy below |
| `startedAt` | Timestamp | initiator | ✓ | When Synthflow accepted the dial |
| `leadId` | string | initiator | ✗ | Salesforce Lead ID; may be empty |
| `firstName` | string | initiator | ✗ | |
| `lastName` | string | initiator | ✗ | |
| `company` | string | initiator | ✗ | |
| `state` | string | initiator | ✗ | From SF Lead.State |
| `areaCode` | string | initiator | ✗ | Derived, first 3 digits of E.164 number |
| `completedAt` | Timestamp | post-call | ✗ | Set when webhook arrives |
| `duration` | number | post-call | ✗ | Seconds |
| `endReason` | string | post-call | ✗ | Synthflow's `end_call_reason` — raw value |
| `recordingUrl` | string | post-call | ✗ | URL to call audio |
| `transcript` | string | post-call | ✗ | Truncated to 32,000 chars |
| `modelId` | string | post-call | ✗ | Synthflow `model_id` — reserved for future A/B comparison |

**Merge semantics:** the ingest function uses `firestore.doc(...).set(payload, { merge: true })` so either workflow can arrive first. Initiated fields are preserved when the post-call completes the doc; post-call fields overwrite any stale values if they re-fire.

### Status taxonomy

The dashboard displays five outcomes. The original mock's "No Value" bucket is folded into `failed` — per Scott, they're semantically the same for MVP. If the client later needs to distinguish "connected but unqualified" from "technical failure," we add a sub-status then.

| Status (ours) | Dashboard label | When |
|---|---|---|
| `initiated` | (internal — shown as "In flight" or hidden) | Initiator wrote; post-call not yet arrived |
| `connected` | Connected | Call answered, conversation happened |
| `voicemail` | Voicemail | Voicemail reached / left |
| `no_answer` | No Answer | Nobody picked up |
| `busy` | Busy | Line busy |
| `failed` | Failed | Technical / other failure |

**Synthflow → our status mapping** (applied by the ingest function on post-call):

| Synthflow `call.status` | Our `status` |
|---|---|
| `completed` | `connected` |
| `hangup_on_voicemail` | `voicemail` |
| `no-answer` | `no_answer` |
| `no_answer` | `no_answer` |
| `busy` | `busy` |
| `failed` | `failed` |
| *anything else* | `failed` |

### Orphan detection

Any doc where `status === 'initiated'` AND `startedAt` is older than ~10 minutes is a "lost" call — the post-call webhook never fired. The dashboard surfaces these as a separate count so Jason can spot Synthflow delivery issues.

### Indexes

Composite indexes likely needed once we hit volume (Firestore will prompt in the console the first time a query fails):
- `campaign` + `startedAt` (for per-campaign time-filtered queries)
- `status` + `startedAt` (for outcome-bucketed charts)

## Security rule

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /calls/{callId} {
      allow read:  if isAuthorized();
      allow write: if request.auth != null
                   && request.auth.uid == '<INGEST_USER_UID>';
    }

    // Allowlist collection — resolved in walk item 4
    match /authorized_users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false; // manual via Firebase console
    }
  }

  function isAuthorized() {
    return request.auth != null &&
           exists(/databases/$(database)/documents/authorized_users/$(request.auth.uid));
  }
}
```

Placeholder `<INGEST_USER_UID>` gets filled in during Firebase setup (walk item 5).

## Ingest function contracts

The Vercel function at `/api/ingest` accepts two payload shapes. Header `X-Ingest-Secret` must match the `INGEST_SECRET` env var or it returns 401.

### POST `/api/ingest` — type: `initiated`

```json
{
  "type": "initiated",
  "call_id": "sf_abc123",
  "phone": "+16025551234",
  "campaign": "AZ_CrossSell",
  "leadId": "00Q5f00000ABCxyzEAA",
  "firstName": "Jane",
  "lastName": "Doe",
  "company": "Acme Medical",
  "state": "AZ",
  "areaCode": "602",
  "startedAt": "2026-04-22T14:03:27Z"
}
```

Effect: `set({...fields, status: 'initiated'}, { merge: true })` on `calls/{call_id}`.

### POST `/api/ingest` — type: `completed`

```json
{
  "type": "completed",
  "call_id": "sf_abc123",
  "synthflowStatus": "completed",
  "duration": 142,
  "endReason": "user_hangup",
  "recordingUrl": "https://synthflow.ai/recordings/abc123.mp3",
  "transcript": "Agent: Hi Jane, this is ...",
  "modelId": "0df733c4-a8fb-4d14-a12a-55fc62396bc7",
  "completedAt": "2026-04-22T14:06:49Z",
  "phone": "+16025551234"
}
```

Effect: map `synthflowStatus` → our `status`, then `set({...fields, status}, { merge: true })` on `calls/{call_id}`. If doc doesn't exist yet (post-call arrived first, or initiator write failed), this creates it with only post-call fields plus `phone`.

## Sample documents

### 1. In flight (initiated, no post-call yet)

```json
{
  "callId":     "sf_abc123",
  "phone":      "+16025551234",
  "campaign":   "AZ_CrossSell",
  "status":     "initiated",
  "startedAt":  "2026-04-22T14:03:27Z",
  "leadId":     "00Q5f00000ABCxyzEAA",
  "firstName":  "Jane",
  "lastName":   "Doe",
  "company":    "Acme Medical",
  "state":      "AZ",
  "areaCode":   "602"
}
```

### 2. Connected (happy path)

```json
{
  "callId":       "sf_abc123",
  "phone":        "+16025551234",
  "campaign":     "AZ_CrossSell",
  "status":       "connected",
  "startedAt":    "2026-04-22T14:03:27Z",
  "completedAt":  "2026-04-22T14:06:49Z",
  "duration":     202,
  "endReason":    "user_hangup",
  "recordingUrl": "https://synthflow.ai/recordings/abc123.mp3",
  "transcript":   "Agent: Hi Jane ... (truncated)",
  "modelId":      "0df733c4-a8fb-4d14-a12a-55fc62396bc7",
  "leadId":       "00Q5f00000ABCxyzEAA",
  "firstName":    "Jane",
  "lastName":     "Doe",
  "company":      "Acme Medical",
  "state":        "AZ",
  "areaCode":     "602"
}
```

### 3. Voicemail (post-call arrived first, no initiator doc)

Rare failure mode — initiator write never happened but Synthflow still placed the call. Ingest creates the doc from post-call data only.

```json
{
  "callId":       "sf_xyz789",
  "phone":        "+12145559988",
  "campaign":     "",
  "status":       "voicemail",
  "completedAt":  "2026-04-22T14:12:03Z",
  "duration":     18,
  "endReason":    "voicemail_detected",
  "recordingUrl": "https://synthflow.ai/recordings/xyz789.mp3",
  "transcript":   "Agent: Hi, this is calling for ...",
  "modelId":      "0df733c4-a8fb-4d14-a12a-55fc62396bc7"
}
```

Missing `campaign` is a flag the frontend handles gracefully (groups into an "Unknown" bucket).

## Open questions surfaced by this schema

1. **Does Synthflow's `POST /v2/calls` response include `call_id`?** If no, we switch to a UUID-in-custom-variable strategy. First test run answers this.
2. **Do we need to store the raw Synthflow `end_call_reason` values**, or just the mapped status? Kept both for now — cheap, may be useful for debugging.
3. **Transcript size** — 32k is Synthflow's / the existing workflow's limit. Firestore doc limit is 1 MiB. We're well under.
