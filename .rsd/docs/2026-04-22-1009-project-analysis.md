# Project Analysis

Written: 2026-04-22 10:09 · Context at save: (unknown)
Branch: n8n-firebase-bridge · Commit: f4c8c15

## Content

---

### Part 1 — Initial review of the OnSite-SF-Throttle-v3-TEST-v2 workflow

I've reviewed the project memory and the n8n workflow. Before we dive in, here's what I found — and there's a big insight that changes the framing.

#### What this workflow actually does

**Name says it all: "OnSite-SF-Throttle-v3-TEST-v2"** — this is the **call initiator**, not the call reporter. It runs weekdays at 9 AM (or manually):

1. Queries Salesforce for leads that haven't been AI-called yet (`AI_Call_Status__c = null or 'Not_Called'`, `AI_Call_Engage__c = true`)
2. Paginates through all results, normalizes phones to E.164, routes each lead to a campaign based on state/area code (`AZ_CrossSell` or `TX_ColdOutreach`)
3. Loops contacts with a 2-second throttle → POSTs each one to `https://api.synthflow.ai/v2/calls`
4. Marks the Lead in Salesforce as `Called` or `Failed` based on whether the API accepted the initiation

#### The big realization

**This workflow only knows "I dialed the phone." It does not know the call outcome.**

The actual call result — connected / no-answer / voicemail / duration / transcript / recording — comes back from Synthflow **later**, via this line buried in the Synthflow API Call node:

```
"external_webhook_url": "https://salesarcsolutions.app.n8n.cloud/webhook/onsite-postcall"
```

That's a **separate n8n workflow** that fires when each call completes. **That's where the dashboard data lives.** We don't have that workflow file in the repo yet — we need it.

#### Second realization — the "agents" problem

The DashARC mock data is structured around **human SDRs** ("Sarah", "Mike", etc. in `src/mock/callData.js`). But this system is **AI-dialed** — all calls go through one Synthflow `model_id` (`0df733c4-a8fb-4d14-a12a-55fc62396bc7`). So the dashboard's chart-per-agent concept needs a new axis. Possibilities:

- One row per **campaign** (AZ_CrossSell vs TX_ColdOutreach)
- One row per **Synthflow model** (if OnSite uses multiple AI personas)
- One row per **day / hour bucket** (volume over time)
- Something else

#### Where we could inject Firebase writes

Once we have the post-call workflow, we have a few options:

- **A. HTTP Request node → Firestore REST API** — simplest. Service account JWT, one POST per call event. No extra infra.
- **B. HTTP Request node → our own Cloud Function** — gives us a place to validate/transform the payload before writing. Adds one piece of infrastructure but keeps n8n dumb.
- **C. Fork at Synthflow** — configure a second `external_webhook_url` that points to our own endpoint, bypassing n8n entirely. Cleanest isolation but depends on whether Synthflow supports multiple webhooks.

We could also add a lightweight Firebase write to **this** initiator workflow (after the Synthflow API call succeeds) to log "call attempted" — useful if the post-call webhook ever silently fails.

#### Questions for you

1. **Can you get the `onsite-postcall` workflow JSON?** That's the one that has the actual outcome data. It's on `salesarcsolutions.app.n8n.cloud`.
2. **What does Synthflow's post-call payload look like?** (Any sample response, docs, or logs.) That dictates our Firestore schema.
3. **What's the "axis" of the dashboard in this world?** Campaign? Model? Day? If AI does all the calling, who/what are we comparing against each other?
4. **Does Jason want both initiated-but-unanswered attempts AND completed calls shown**, or only completed calls?

Which of those do you want to tackle first?

---

### Part 2 — Post-call workflow review + sync strategy + grouping proposal

Branch `n8n-firebase-bridge` created. The post-call workflow is a goldmine — it tells us exactly what Synthflow sends. Here's what changes the picture.

#### What the post-call payload actually contains

From the `Extract Call Data` node, Synthflow POSTs:

```
body.call.status            // "completed" | "hangup_on_voicemail" | "no-answer" |
                            // "no_answer" | "busy" | "failed"
body.call.call_id
body.call.duration
body.call.end_call_reason
body.call.transcript         // full text, truncated to 32k
body.call.recording_url      // the audio URL we were wondering about
body.call.start_time         // ISO timestamp
body.call.custom_variables   // includes campaign and (sometimes) leadId
body.lead.phone_number
```

**This resolves Open Question #1** — audio/transcript come via the post-call webhook. We don't need to deep-link into Synthflow's UI. We just write `recording_url` and `transcript` to Firestore.

**One gotcha noted in the workflow**: `// Synthflow does not return custom_variables in webhook` — they fall back to SOQL-by-phone. We'll inherit the same ambiguity: sometimes we'll have `leadId`, sometimes just phone.

#### The sync problem — your instinct was right

Two failure modes:
- **Initiated, never-post-called** — Synthflow accepted the call but we never hear back (webhook dropped, Synthflow error, network blip)
- **Post-called, never-initiated** — less likely, but possible if Synthflow retries, if someone fires a manual call, or if our init-write fails while the call itself succeeds

**The fix:** Write to Firestore from **both** workflows, keyed on `call_id`, with an additive model:

| When | Write | Fields |
|---|---|---|
| After `Synthflow API Call` succeeds (initiator) | **create** doc at `calls/{call_id}` | status: `initiated`, campaign, phone, leadId, firstName, lastName, company, state, startedAt |
| On post-call webhook | **merge** into `calls/{call_id}` | status: `completed`/`voicemail`/`no_answer`/etc., duration, transcript, recording_url, completedAt, endReason |

Firestore `set({}, {merge: true})` handles both "doc exists, update it" and "doc doesn't exist, create it" — so race conditions between the two workflows don't break anything. We get orphan-detection for free: any doc older than ~10 min still stuck on `initiated` is a lost call.

**Caveat:** the initiator workflow doesn't currently capture the `call_id` from Synthflow's API response. We'd have to add a tiny capture step. If Synthflow's response doesn't include one, we'd key by `{phone}-{startedAt}` and reconcile on post-call.

#### The "grouping" question — my proposal

The human-SDR model doesn't translate. With AI, one `model_id` handles every call — there's no "Sarah vs Mike" to compare. But the dashboard's **principles** (activity/outcomes + drill-down) are sound; we just need new axes.

**Primary axis: Campaign.** Here it's `AZ_CrossSell` vs `TX_ColdOutreach`. That's the real unit of comparison — a campaign bundles *audience segment + pitch/prompt + outcome*. If AZ connects 40% and TX connects 12%, that tells Jason something actionable: the AZ list or pitch is working; the TX one isn't.

**Secondary axis: Funnel stage (per campaign).** This is what the dashboard's stacked bar becomes:

```
Dialed → Connected → Talked >N sec → Qualified / Booked
         ↓ Voicemail
         ↓ No Answer
         ↓ Busy / Failed
```

**Reserved axis: Model/Script version.** Not surfaced in the UI yet, but we should store `model_id` on every call doc. The minute Jason wants to A/B test two scripts, you have the data.

**Reserved axis: Time.** Today / 7 days / 30 days stays as the filter it already is.

**What "No value" becomes:** in the mock data, "No value" meant "connected but not a real lead." Synthflow doesn't label this for us. Options: (a) derive it from `duration < 30s` AND `status=completed` (noisy but simple), (b) add an AI classification pass on the transcript later, (c) drop the bucket for MVP and show four outcomes: Connected, Voicemail, No Answer, Failed.

**The dashboard becomes:** "How is each *campaign* performing, measured by call outcomes, with drill-down to any individual call's recording and transcript." Same principles, correct axis for an AI-dialing world.

#### Questions for you

1. **Campaign as primary axis — yes?** Or do you want to pitch Jason something different (e.g., show outcomes across all calls for the week, with campaign as a secondary filter)?
2. **"No value" bucket** — drop it for MVP, use a duration heuristic, or defer until we add transcript classification?
3. **Do we write from BOTH workflows** (initiator + post-call) or just the post-call to start? Both is more robust but doubles the integration surface. I'd vote both — the orphan detection is worth it, and the initiator write is trivial.
4. **Firestore auth from n8n** — do you want me to use the Firestore REST API directly (service account JWT, all inside n8n) or stand up a tiny Cloud Function that n8n POSTs to? REST API is fewer moving parts; Cloud Function gives us a validation seam if the payload shape shifts.
5. **Does SalesARC's n8n instance have a `Firebase Admin` or `Firestore` community node installed?** If yes, we can skip the REST/JWT dance entirely and use the node.

Pick your answers and I'll write the design doc + migration plan. No code yet until we align.
