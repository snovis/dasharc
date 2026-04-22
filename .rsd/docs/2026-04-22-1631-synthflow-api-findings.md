# Synthflow API Research Findings

Written: 2026-04-22 16:31 · Context at save: (unknown)
Branch: synthflow-direct · Commit: 083b187

## Content

Probed Synthflow's `GET /v2/calls` endpoint live against SalesARC's agency account using the OnSite Medical agent (`model_id=0df733c4-a8fb-4d14-a12a-55fc62396bc7`). This is the research product from walk item #1 — "Confirm Synthflow list-calls API shape" — the go/no-go gate for the Synthflow-direct pivot.

### Summary

**Synthflow `list-calls` API — GO ✅**

| Question | Answer |
|---|---|
| `model_id` filter | Works |
| Date filtering | Works via `from_date` / `to_date` (accepts YYYY-MM-DD, ISO, or epoch ms). **`to_date` is exclusive** — gotcha to document in the proxy. |
| Pagination | Offset-based (`limit` max **100**, `offset`, `total_records` returned) |
| Auth | `Authorization: Bearer <key>` |
| Error envelope | `{detail: {status, description, request_id, category}}` |
| Response shape | `{status, response: {pagination, calls: [...]}}` |
| `recording_url` | Populated for both voicemails AND completed calls |
| `transcript` | Plain string, format `\nhuman: ...\nassistant: ...` — need to split on speaker prefix for chat-style UI |
| `judge_results` | Rich AI quality-scoring object (~35 fields: sentiment, persona, goal completion, per-dimension feedback). **Big dashboard opportunity.** |

### Surprises worth noting

1. **`limit=100` cap.** A 30-day chart on this agent pulls ~3,000 records = ~30 paginated requests. Doable but worth caching aggressively in TanStack, and possibly pre-aggregating server-side later.

2. **The OnSite agent's recent calls look broken** — 80/100 are `hangup_on_voicemail`, 4 "completed" calls have transcripts of 0–16 chars ending mid-sentence ("human: This is."). Not our bug — it's real operational data showing the campaign has issues. Worth flagging to Jason at some point but doesn't block us.

3. **Status values** you'll want in the stacked bar: `hangup_on_voicemail`, `no-answer`, `failed`, `completed`, `left_voicemail` (plus more we haven't seen yet). `telephony_disconnect_reason` gives finer detail if needed.

### Supporting evidence (raw probe data)

**Call volume (OnSite Medical agent):**
- All-time: 2,849 calls
- April 2026 (month-to-date): 1,863
- Last 3 days (Apr 20–22): 1,032

**Call object fields (33 total):**
```
agent_phone_number, agents_used, assistant_version, call_id, call_status,
campaign_type, collected_variables, deployment_type, duration, end_call_reason,
error_message, executed_actions, judge_results, labels, lead_name,
lead_phone_number, model_id, name, phone_number_from, phone_number_to,
recording_duration, recording_url, start_time, telephony_disconnect_reason,
telephony_duration, telephony_end, telephony_hangup, telephony_ringing_duration,
telephony_sip_headers, telephony_start, timezone, transcript, type_of_call
```

**Status distribution (most recent 100 calls):**
```json
[
  {"status": "hangup_on_voicemail", "count": 80},
  {"status": "no-answer",           "count": 7},
  {"status": "failed",              "count": 5},
  {"status": "completed",           "count": 4},
  {"status": "left_voicemail",      "count": 4}
]
```

**Transcript lengths (completed calls in recent 100):** `[14, 0, 0, 16]` — max 16 chars. Longest sample: `"\nhuman: This is."` on a 23-second call. This agent's transcripts are unusually short; a healthy agent would produce multi-kilobyte transcripts.

**Completed call object snapshot:**
```json
{
  "call_id": "1d1772ff-c440-43b9-80be-ad1ceb49c5a7",
  "call_status": "completed",
  "duration": "25",
  "start_time": "1776876567837",
  "telephony_start": "2026-04-22T16:49:29",
  "recording_url_present": true,
  "recording_duration": null,
  "transcript_type": "string",
  "transcript_len": 14,
  "collected_variables_type": "null",
  "judge_results_type": "object"
}
```

**`judge_results` keys (from first completed call with populated judge):**
```
goal_feedback, answered_by_human, objections_feedback, call_completion_feedback,
no_opt_out, user_sentiment, appointment_feedback, opted_in_feedback,
call_summary_feedback, all_feedback, steps, steps_feedback, style_feedback,
no_repetition_feedback, appointment, agent_sentiment_feedback, no_opt_out_feedback,
knowledge, objection_not_defined, style, answered_by_human_feedback,
call_completion, objection_not_defined_feedback, objections, opted_in,
judge_found_partial_or_error, persona, goal, call_summary,
user_sentiment_feedback, agent_sentiment, no_repetition, knowledge_feedback,
judge_found_full_error, persona_feedback
```

Values are all strings — mix of boolean-as-string (`"true"` / `"false"` / `"True"`) and free-text feedback paragraphs. `user_sentiment` observed value: `"partial"`.

**Date filter format variants that work (all returned same count):**
- `from_date=2026-04-20T00:00:00&to_date=2026-04-23T00:00:00` → 1,032
- `from_date=1776643200000&to_date=1776988800000` → 1,032
- `from_date=2026-04-01&to_date=2026-04-30` → 1,863

**Date filter format that SILENTLY FAILED (trap):**
- `start_date=2026-04-20&end_date=2026-04-22` → returned 2,849 (all records, ignored the filter)

Lesson: the API doesn't reject unknown query params; it silently ignores them. Test before trusting.

**Limit cap error response:**
```json
{
  "detail": {
    "status": "error",
    "description": "Limit must be between 1 and 100.",
    "request_id": "c95352c01d694ab4add8711461cfbcfa",
    "category": "important"
  }
}
```

Note: error shape is `{detail: {...}}`, different from success shape `{status, response}`. The proxy needs to handle both.
