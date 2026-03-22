import { useQuery } from '@tanstack/react-query'
import {
  mockCalls,
  filterByPeriod,
  aggregateCallOutcomes,
  aggregateActivity,
  getAgentCalls,
} from '../mock/callData'
import appConfig from '../config/app'

// When VITE_USE_MOCK_DATA=false, replace these fetchers with Firestore queries.

async function fetchCallsForPeriod(period) {
  if (appConfig.useMockData) {
    await new Promise(r => setTimeout(r, 300)) // simulate network
    return filterByPeriod(mockCalls, period)
  }
  // TODO: Firestore implementation
  // const q = query(collection(db, 'calls'), where('timestamp', '>=', periodStart(period)))
  // const snap = await getDocs(q)
  // return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  throw new Error('Firestore not yet configured')
}

export function useCallOutcomes(period) {
  return useQuery({
    queryKey: ['call-outcomes', period],
    queryFn: async () => {
      const calls = await fetchCallsForPeriod(period)
      return aggregateCallOutcomes(calls)
    },
    staleTime: 1000 * 60 * 5, // 5 min
  })
}

export function useActivityLeaderboard(period) {
  return useQuery({
    queryKey: ['activity-leaderboard', period],
    queryFn: async () => {
      const calls = await fetchCallsForPeriod(period)
      return aggregateActivity(calls)
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useAgentCalls(agentId, period) {
  return useQuery({
    queryKey: ['agent-calls', agentId, period],
    queryFn: async () => {
      const calls = await fetchCallsForPeriod(period)
      return getAgentCalls(calls, agentId)
    },
    enabled: !!agentId,
    staleTime: 1000 * 60 * 5,
  })
}
