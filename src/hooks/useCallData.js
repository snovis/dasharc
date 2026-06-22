import { useRef, useState, useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useAuth } from './useAuth'

async function authedFetch(url, options) {
  // Auth rides along in the httpOnly session cookie — same-origin, so just
  // include credentials.
  const res = await fetch(url, { credentials: 'include', ...options })
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

export function useAgents({ accountId } = {}) {
  const { isAuthenticated } = useAuth()
  const url = accountId
    ? `/api/agents?accountId=${encodeURIComponent(accountId)}`
    : '/api/agents'
  return useQuery({
    queryKey: ['agents', accountId ?? null],
    queryFn: async () => (await authedFetch(url)).agents ?? [],
    enabled: isAuthenticated,
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

async function fetchAllCalls({ agentId, fromDate, toDate, onProgress }) {
  const fetchPage = (offset) => {
    const params = new URLSearchParams({
      agentId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    })
    if (fromDate) params.set('fromDate', fromDate)
    if (toDate) params.set('toDate', toDate)
    return authedFetch(`/api/calls?${params}`)
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
  const { isAuthenticated } = useAuth()
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
        agentId,
        fromDate,
        toDate,
        onProgress: (loaded, total) => setterRef.current({ loaded, total }),
      })
    },
    enabled: isAuthenticated && !!agentId,
    staleTime: 1000 * 60 * 2,
  })

  return { ...query, progress }
}

// Multi-agent fan-out: fires useCalls in parallel for each provided agentId
// and returns the concatenated result. Used when the dashboard's agent
// selector is set to "All agents" within an account.
//
// Errors and pending states aggregate: any pending → pending; any error → error.
// Progress aggregates loaded/total across all agents so the progress bar
// reflects the total work in flight.
export function useCallsForAgents({ agentIds, fromDate, toDate }) {
  const { isAuthenticated } = useAuth()
  const [progressByAgent, setProgressByAgent] = useState({})

  const queries = useQueries({
    queries: (agentIds ?? []).map((agentId) => ({
      queryKey: ['calls', agentId, fromDate, toDate],
      queryFn: () =>
        fetchAllCalls({
          agentId,
          fromDate,
          toDate,
          onProgress: (loaded, total) =>
            setProgressByAgent((prev) => ({ ...prev, [agentId]: { loaded, total } })),
        }),
      enabled: isAuthenticated && !!agentId,
      staleTime: 1000 * 60 * 2,
    })),
  })

  const isPending = queries.some((q) => q.isPending)
  const isError = queries.some((q) => q.isError)
  const error = queries.find((q) => q.isError)?.error

  const calls = useMemo(() => {
    if (isPending || isError) return []
    return queries.flatMap((q) => q.data ?? [])
  }, [queries, isPending, isError])

  const progress = useMemo(() => {
    let loaded = 0, total = 0
    for (const p of Object.values(progressByAgent)) {
      loaded += p.loaded ?? 0
      total += p.total ?? 0
    }
    return { loaded, total }
  }, [progressByAgent])

  return { data: calls, isPending, isError, error, progress }
}

export function useCall(callId) {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['call', callId],
    queryFn: async () => (await authedFetch(`/api/call?id=${encodeURIComponent(callId)}`)).call,
    enabled: isAuthenticated && !!callId,
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

// ─── Dallas RVM Calls ─────────────────────────────────────────────────────────

async function fetchDallasCalls({ accountId, fromDate, toDate, onProgress }) {
  const params = new URLSearchParams({ accountId })
  if (fromDate) params.set('fromDate', fromDate)
  if (toDate) params.set('toDate', toDate)

  const first = await authedFetch(`/api/dallas-calls?${params}`)
  const firstCalls = first.calls ?? []
  onProgress?.(firstCalls.length, 0)

  if (!first.nextPageToken) return firstCalls

  const allCalls = [...firstCalls]
  let nextPageToken = first.nextPageToken
  let pagesLoaded = 1

  while (nextPageToken && pagesLoaded < MAX_PAGES) {
    const pageParams = new URLSearchParams({ accountId, pageToken: nextPageToken })
    if (fromDate) pageParams.set('fromDate', fromDate)
    if (toDate) pageParams.set('toDate', toDate)
    const page = await authedFetch(`/api/dallas-calls?${pageParams}`)
    const pageCalls = page.calls ?? []
    allCalls.push(...pageCalls)
    onProgress?.(allCalls.length, 0)
    nextPageToken = page.nextPageToken ?? null
    pagesLoaded++
  }

  return allCalls
}

export function useDallasCalls({ accountId, fromDate, toDate }) {
  const { isAuthenticated } = useAuth()
  const [progress, setProgress] = useState({ loaded: 0, total: 0 })

  const query = useQuery({
    queryKey: ['dallas-calls', accountId, fromDate, toDate],
    queryFn: () => {
      setProgress({ loaded: 0, total: 0 })
      return fetchDallasCalls({
        accountId,
        fromDate,
        toDate,
        onProgress: (loaded, total) => setProgress({ loaded, total }),
      })
    },
    enabled: isAuthenticated && !!accountId,
    staleTime: 1000 * 60 * 2,
  })

  return { ...query, progress }
}
