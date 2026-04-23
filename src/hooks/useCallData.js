import { useRef, useState } from 'react'
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
// Synthflow caps limit at 100/page. Page 1 is fetched alone to read
// `pagination.total_records`; pages 2..N then fire in parallel batches
// (CONCURRENCY at a time) and are concatenated in offset order.

const PAGE_SIZE = 100
const MAX_PAGES = 50 // safety cap: 5000 calls per query
const CONCURRENCY = 8 // parallel page requests after page 1

async function fetchAllCalls({ idToken, agentId, fromDate, toDate, onProgress }) {
  const fetchPage = (offset) => {
    const params = new URLSearchParams({
      agentId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    return authedFetch(`/api/calls?${params}`, idToken)
  }

  const first = await fetchPage(0)
  const firstCalls = first.calls ?? []
  const total = first.pagination?.total_records

  // Single page, or unknown total → nothing to fan out.
  if (firstCalls.length < PAGE_SIZE || total == null) {
    onProgress?.(firstCalls.length, total ?? firstCalls.length)
    return firstCalls
  }

  const totalPages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES)
  onProgress?.(firstCalls.length, total)
  if (totalPages <= 1) return firstCalls

  const offsets = []
  for (let p = 1; p < totalPages; p++) offsets.push(p * PAGE_SIZE)

  const restPages = []
  let loaded = firstCalls.length

  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const batch = offsets.slice(i, i + CONCURRENCY)
    const batchPages = await Promise.all(
      batch.map((offset) =>
        fetchPage(offset).then((data) => {
          const calls = data.calls ?? []
          loaded += calls.length
          onProgress?.(loaded, total)
          return calls
        })
      )
    )
    for (const page of batchPages) restPages.push(page)
  }

  return [...firstCalls, ...restPages.flat()]
}

export function useCalls({ agentId, fromDate, toDate }) {
  const { idToken } = useAuth()
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })
  // Keep the latest setter in a ref so the queryFn closure always writes to
  // the current component instance (avoids stale closures across re-renders).
  const setterRef = useRef(setProgress)
  setterRef.current = setProgress

  const query = useQuery({
    queryKey: ['calls', agentId, fromDate, toDate],
    queryFn: () => {
      setterRef.current({ loaded: 0, total: 0 })
      return fetchAllCalls({
        idToken,
        agentId,
        fromDate,
        toDate,
        onProgress: (loaded, total) => setterRef.current({ loaded, total }),
      })
    },
    enabled: !!idToken && !!agentId,
    staleTime: 1000 * 60 * 2,
  })

  return { ...query, progress }
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

