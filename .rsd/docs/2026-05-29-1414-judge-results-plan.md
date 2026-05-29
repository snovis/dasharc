# The plan to address judge_results

Written: 2026-05-29 14:14 · Context at save: ~50%
Branch: multi-tenant · Commit: 2558ff2

## Content

Confirmed — the list endpoint carries full `judge_results` (35 keys) for connected/voicemail/hangup calls; `failed` calls legitimately have none (no conversation to judge). So it's worth sourcing from there.

**What it'd take.** The data only exists on the list endpoint (`v2/calls`), never on the single-call endpoint. So the fix is to enrich `/api/call` server-side: after fetching the single call, look it up in the list and merge its `judge_results`. The trick is doing that lookup cheaply — the single-call response gives us the call's `model_id` and `start_time`, so I'd query the list **scoped to that one day** (`model_id` + `from_date`/`to_date` = the call's date) and find the matching `call_id`. That bounds it to ~1 extra upstream request (occasionally 2–3 if that day had >100 calls and needs paging), instead of scanning all history.

**Effort:** ~30–45 min. Mechanically:
- In `server/routes/call.js`, derive the call's date, do the date-scoped list fetch, find by `call_id`, copy over `judge_results`.
- Graceful fallback: if the lookup fails or times out, return the call without judge results rather than breaking the page (the card already hides itself when `judge_results` is empty).

**Tradeoff:** one extra Synthflow round-trip per call-detail view (a bit more latency), plus the small added complexity. The alternative — passing the list row's data via the client when you click into a call — is instant and free, but it breaks on refresh/deep-links (no list in memory), so it's a complement, not a real fix. The server-side enrichment is the durable one.

---

### Supporting findings from this session

**Probe: does the list endpoint actually carry usable judge_results?** (model_id `0df733c4-a8fb-4d14-a12a-55fc62396bc7`, limit 10)

```
failed               judge_results keys: 0
left_voicemail       judge_results keys: 35 [goal_feedback,answered_by_human,objections_feedback,call_completion_feedback,no_opt_out,user_sentiment...]
left_voicemail       judge_results keys: 35 [...]
hangup_on_voicemail  judge_results keys: 35 [...]
hangup_on_voicemail  judge_results keys: 35 [...]
left_voicemail       judge_results keys: 35 [...]
(… remaining left_voicemail rows all 35 keys)
```

**Shape difference between the two Synthflow endpoints** (root cause context, already fixed for name/phone/status in commit 2558ff2):

- List `v2/calls` keys include: `judge_results`, `lead_name`, `lead_phone_number`, `call_status`, `recording_url`, `transcript`, … (a superset).
- Single `v2/calls/{id}` keys: `call_id, campaign_type, collected_variables, duration, end_call_reason, error_message, executed_actions, model_id, name, phone_number_from, phone_number_to, prompt_variables, recording_url, start_time, status, telephony_*, timezone, transcript, type_of_call` — **no** `judge_results`, **no** `lead_name`/`lead_phone_number`, uses `status` instead of `call_status`.
- The single endpoint's `name` field equals the list's `lead_name` (full "First Last"); `prompt_variables` only has `first_name`. Lead phone = `phone_number_to` (outbound) / `phone_number_from` (inbound).

This is why the detail-page fix (commit 2558ff2) backfilled `lead_name`/`lead_phone_number`/`call_status` in `server/routes/call.js`, but `judge_results` remained unrecoverable from that endpoint — hence this plan.
