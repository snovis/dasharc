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

// Bucket calls by time for the "Calls over time" chart. Granularity adapts
// to the period so we always get ~5-7 meaningful bars instead of a single
// tall bar (for "today") or one bar per day (for "30days" / "all").
//
// Returns [{ bucket: '<key>', label: '<display>', ...counts, total }].
// granularity: 'hour' | 'day' | 'week' | 'month'
export function aggregateCallsByBucket(calls, granularity = 'day') {
  const byBucket = new Map()

  function keyOf(t) {
    if (granularity === 'hour') {
      return t.toISOString().slice(0, 13) // YYYY-MM-DDTHH
    }
    if (granularity === 'week') {
      // Bucket by the Sunday of the week (UTC). Sunday is day 0.
      const sunday = new Date(t)
      sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay())
      return sunday.toISOString().slice(0, 10)
    }
    if (granularity === 'month') {
      return t.toISOString().slice(0, 7) // YYYY-MM
    }
    return t.toISOString().slice(0, 10) // day: YYYY-MM-DD
  }

  function labelOf(key) {
    if (granularity === 'hour') {
      const d = new Date(key + ':00:00Z')
      return d.toLocaleTimeString([], { hour: 'numeric' })
    }
    if (granularity === 'week') {
      const sun = new Date(key + 'T00:00:00Z')
      const sat = new Date(sun)
      sat.setUTCDate(sat.getUTCDate() + 6)
      const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
      return `${fmt(sun)}–${fmt(sat)}`
    }
    if (granularity === 'month') {
      const d = new Date(key + '-01T00:00:00Z')
      return d.toLocaleDateString([], { month: 'short', year: 'numeric', timeZone: 'UTC' })
    }
    const d = new Date(key + 'T00:00:00Z')
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }

  for (const call of calls) {
    const t = callTimestamp(call)
    if (!t) continue
    const key = keyOf(t)
    if (!byBucket.has(key)) {
      byBucket.set(key, {
        bucket: key,
        label: labelOf(key),
        completed: 0,
        left_voicemail: 0,
        hangup_on_voicemail: 0,
        no_answer: 0,
        failed: 0,
        other: 0,
        total: 0,
      })
    }
    const row = byBucket.get(key)
    row[normalizeStatus(call.call_status)]++
    row.total++
  }
  return Array.from(byBucket.values()).sort((a, b) => a.bucket.localeCompare(b.bucket))
}

// Map dashboard period → bucket granularity.
export function granularityForPeriod(period) {
  if (period === 'today') return 'hour'
  if (period === '7days') return 'day'
  if (period === '30days') return 'week'
  if (period === 'all') return 'month'
  return 'day'
}

// Enumerate every bucket key + label we expect to appear between fromDate
// and toDate at the given granularity. Used to pad the chart with zero-bars
// for days/weeks/months where no calls happened, so the time range is
// visually represented even when the data is sparse.
//
// fromDate / toDate are YYYY-MM-DD strings (the dashboard's inclusive range).
export function enumerateBuckets(fromDate, toDate, granularity) {
  if (!fromDate || !toDate || granularity === 'month') {
    // month buckets: no padding — 'all' period has no meaningful range
    return []
  }

  const start = new Date(fromDate + 'T00:00:00Z')
  const end = new Date(toDate + 'T00:00:00Z')
  if (isNaN(start) || isNaN(end) || end < start) return []

  const keys = []
  const labels = []
  const iter = new Date(start)

  if (granularity === 'hour') {
    // 'today' → 24 hourly buckets from local midnight through local 11 PM.
    // Keys are still UTC (matching the aggregator), so a call at e.g. UTC 14:00
    // on a UTC-6 client maps to a local 8 AM bucket whose key is '...T14'.
    const local = new Date()
    local.setHours(0, 0, 0, 0)
    for (let h = 0; h < 24; h++) {
      const k = local.toISOString().slice(0, 13)
      keys.push(k)
      labels.push(local.toLocaleTimeString([], { hour: 'numeric' }))
      local.setHours(local.getHours() + 1)
    }
    return keys.map((k, i) => ({ bucket: k, label: labels[i] }))
  }

  if (granularity === 'week') {
    // Walk from the Sunday of `start`'s week through the Sunday of `end`'s week.
    const cur = new Date(start)
    cur.setUTCDate(cur.getUTCDate() - cur.getUTCDay())
    const last = new Date(end)
    last.setUTCDate(last.getUTCDate() - last.getUTCDay())
    while (cur <= last) {
      const k = cur.toISOString().slice(0, 10)
      const sat = new Date(cur)
      sat.setUTCDate(sat.getUTCDate() + 6)
      const fmt = (d) => d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })
      keys.push(k)
      labels.push(`${fmt(cur)}–${fmt(sat)}`)
      cur.setUTCDate(cur.getUTCDate() + 7)
    }
    return keys.map((k, i) => ({ bucket: k, label: labels[i] }))
  }

  // Default: day granularity
  while (iter <= end) {
    const k = iter.toISOString().slice(0, 10)
    keys.push(k)
    labels.push(iter.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' }))
    iter.setUTCDate(iter.getUTCDate() + 1)
  }
  return keys.map((k, i) => ({ bucket: k, label: labels[i] }))
}

// Merge an enumerated skeleton with aggregated data, preserving skeleton
// order and zero-filling any empty buckets.
export function padBuckets(skeleton, aggregated) {
  if (!skeleton || skeleton.length === 0) return aggregated
  const map = new Map(aggregated.map((row) => [row.bucket, row]))
  return skeleton.map(({ bucket, label }) => map.get(bucket) ?? {
    bucket,
    label,
    completed: 0,
    left_voicemail: 0,
    hangup_on_voicemail: 0,
    no_answer: 0,
    failed: 0,
    other: 0,
    total: 0,
  })
}
