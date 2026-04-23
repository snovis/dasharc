import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'

async function authedFetch(url, idToken) {
  if (!idToken) throw new Error('Not authenticated')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body.error || `HTTP ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export function useAgents() {
  const { idToken } = useAuth()
  return useQuery({
    queryKey: ['agents'],
    queryFn: async () => (await authedFetch('/api/agents', idToken)).agents ?? [],
    enabled: !!idToken,
    staleTime: 1000 * 60 * 10,
  })
}

// ─── Calls (paginates through all results for the date range) ────────────────
// Synthflow caps limit at 100/page; this helper walks pages until drained or
// the safety cap is hit, so consumers get a single array of all matching calls.

const PAGE_SIZE = 100
const MAX_PAGES = 50 // safety cap: 5000 calls per query

async function fetchAllCalls({ idToken, agentId, fromDate, toDate }) {
  const all = []
  let offset = 0
  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({
      agentId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    const data = await authedFetch(`/api/calls?${params}`, idToken)
    const page = data.calls ?? []
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

export function useCalls({ agentId, fromDate, toDate }) {
  const { idToken } = useAuth()
  return useQuery({
    queryKey: ['calls', agentId, fromDate, toDate],
    queryFn: () => fetchAllCalls({ idToken, agentId, fromDate, toDate }),
    enabled: !!idToken && !!agentId,
    staleTime: 1000 * 60 * 2,
  })
}

export function useCall(callId) {
  const { idToken } = useAuth()
  return useQuery({
    queryKey: ['call', callId],
    queryFn: async () => (await authedFetch(`/api/call?id=${encodeURIComponent(callId)}`, idToken)).call,
    enabled: !!idToken && !!callId,
    staleTime: 1000 * 60 * 10,
  })
}

// ─── Period helper ───────────────────────────────────────────────────────────

export function periodToDateRange(period, now = new Date()) {
  if (period === 'all') return { fromDate: undefined, toDate: undefined }
  const toDate = now.toISOString().slice(0, 10)
  const from = new Date(now)
  if (period === '7days') from.setDate(from.getDate() - 6)
  else if (period === '30days') from.setDate(from.getDate() - 29)
  // 'today' falls through — from stays at today's date
  const fromDate = from.toISOString().slice(0, 10)
  return { fromDate, toDate }
}

