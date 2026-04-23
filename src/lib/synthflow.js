// Shared utilities for Synthflow call data: status mapping, formatters, transcript parsing.

export const OUTCOME_BUCKETS = [
  { key: 'completed',          label: 'Connected',         color: '#10b981' },
  { key: 'left_voicemail',     label: 'Left voicemail',    color: '#3b82f6' },
  { key: 'hangup_on_voicemail',label: 'Hangup on voicemail', color: '#0ea5e9' },
  { key: 'no_answer',          label: 'No answer',         color: '#f97316' },
  { key: 'failed',             label: 'Failed',            color: '#ef4444' },
  { key: 'other',              label: 'Other',             color: '#94a3b8' },
]

export const OUTCOME_PILL_CLASS = {
  completed:           'bg-emerald-100 text-emerald-700',
  left_voicemail:      'bg-blue-100 text-blue-700',
  hangup_on_voicemail: 'bg-sky-100 text-sky-700',
  no_answer:           'bg-orange-100 text-orange-700',
  failed:              'bg-red-100 text-red-700',
  other:               'bg-slate-100 text-slate-600',
}

// Normalize Synthflow's raw call_status into one of our 6 buckets.
// Synthflow's "no-answer" uses a hyphen; we use underscores internally to
// stay key-safe in Recharts' dataKey attribute.
export function normalizeStatus(raw) {
  if (!raw) return 'other'
  const s = String(raw).toLowerCase().replace(/-/g, '_')
  if (['completed', 'left_voicemail', 'hangup_on_voicemail', 'no_answer', 'failed'].includes(s)) {
    return s
  }
  return 'other'
}

export function outcomeLabel(normalized) {
  return OUTCOME_BUCKETS.find((b) => b.key === normalized)?.label ?? normalized
}

export function outcomePillClass(normalized) {
  return OUTCOME_PILL_CLASS[normalized] ?? OUTCOME_PILL_CLASS.other
}

// ─── Time helpers ────────────────────────────────────────────────────────────

// Synthflow's telephony_start is ISO-ish without timezone: "2026-04-22T16:50:10".
// Browsers parse this as local time; server parses as UTC. We treat it as UTC
// for consistency with the from_date/to_date filter semantics.
export function callTimestamp(call) {
  if (!call) return null
  const s = call.telephony_start || call.start_time
  if (!s) return null
  if (/^\d+$/.test(String(s))) return new Date(Number(s))
  if (typeof s === 'string' && !s.endsWith('Z') && s.length === 19) return new Date(s + 'Z')
  return new Date(s)
}

export function formatDuration(secondsLike) {
  const n = Number(secondsLike)
  if (!Number.isFinite(n) || n <= 0) return '—'
  const m = Math.floor(n / 60)
  const s = Math.round(n % 60)
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function formatTime(date) {
  if (!date) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(date) {
  if (!date) return ''
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatDateTime(date) {
  if (!date) return ''
  return date.toLocaleString()
}

// ─── Transcript parsing ──────────────────────────────────────────────────────

// Synthflow transcripts are flat strings like "\nhuman: Hi\nassistant: Hello..."
// Returns an array of { role, text } segments, or [] if empty/null.
export function parseTranscript(raw) {
  if (!raw || typeof raw !== 'string') return []
  const segments = []
  const pattern = /\n?(human|assistant):\s*/gi
  let match
  const tokens = []
  while ((match = pattern.exec(raw)) !== null) {
    tokens.push({ role: match[1].toLowerCase(), start: match.index + match[0].length, headerEnd: match.index + match[0].length })
  }
  for (let i = 0; i < tokens.length; i++) {
    const end = i + 1 < tokens.length ? raw.indexOf('\n' + tokens[i + 1].role, tokens[i].headerEnd) : raw.length
    const text = raw.slice(tokens[i].start, end === -1 ? raw.length : end).trim()
    if (text) segments.push({ role: tokens[i].role, text })
  }
  if (segments.length === 0 && raw.trim()) {
    segments.push({ role: 'unknown', text: raw.trim() })
  }
  return segments
}

// ─── Aggregation helpers ─────────────────────────────────────────────────────

// Build one row of { name, total, completed, left_voicemail, ... } per agent.
// For single-agent deployments this produces a 1-element array.
export function aggregateOutcomesByAgent(calls, agents) {
  const byAgent = new Map()
  for (const a of agents) {
    byAgent.set(a.model_id, {
      agentId: a.model_id,
      name: a.name || a.model_id,
      total: 0,
      completed: 0,
      left_voicemail: 0,
      hangup_on_voicemail: 0,
      no_answer: 0,
      failed: 0,
      other: 0,
    })
  }
  for (const call of calls) {
    const row = byAgent.get(call.model_id)
    if (!row) continue
    const bucket = normalizeStatus(call.call_status)
    row[bucket]++
    row.total++
  }
  return Array.from(byAgent.values()).sort((a, b) => b.total - a.total)
}

// Bucket calls by day for the "Calls over time" chart.
// Returns [{ date: 'YYYY-MM-DD', completed, left_voicemail, ..., total }].
export function aggregateCallsByDay(calls) {
  const byDay = new Map()
  for (const call of calls) {
    const t = callTimestamp(call)
    if (!t) continue
    const day = t.toISOString().slice(0, 10)
    if (!byDay.has(day)) {
      byDay.set(day, {
        date: day,
        completed: 0,
        left_voicemail: 0,
        hangup_on_voicemail: 0,
        no_answer: 0,
        failed: 0,
        other: 0,
        total: 0,
      })
    }
    const row = byDay.get(day)
    const bucket = normalizeStatus(call.call_status)
    row[bucket]++
    row.total++
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date))
}
