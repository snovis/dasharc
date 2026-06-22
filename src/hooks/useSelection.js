import { useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMe } from './useMe'

// Drives the "what am I looking at right now" state — selected account and,
// within that account, selected agent ("all" or a specific model_id).
//
// State lives in URL query params (?account=X&agent=Y) so reloads, bookmarks,
// and support shares are stable. Defaults: first account, "all" if that account
// has >1 agent, otherwise the single agent's id.
export function useSelection() {
  const { data: me } = useMe()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const accounts = useMemo(() => me?.accounts ?? [], [me?.accounts])
  const defaultAccountId = accounts[0]?.id ?? null

  const urlAccountId = searchParams.get('account')
  const accountId = useMemo(() => {
    if (urlAccountId && accounts.some((a) => a.id === urlAccountId)) return urlAccountId
    return defaultAccountId
  }, [urlAccountId, accounts, defaultAccountId])

  const account = accounts.find((a) => a.id === accountId) ?? null
  const agents = useMemo(() => account?.agents ?? [], [account?.agents])

  // Default agent: if only one agent, default to it; if multiple, default to "all".
  const defaultAgentId = agents.length === 1 ? agents[0].id : 'all'
  const urlAgentId = searchParams.get('agent')
  const agentId = useMemo(() => {
    if (urlAgentId === 'all') return 'all'
    if (urlAgentId && agents.some((a) => a.id === urlAgentId)) return urlAgentId
    return defaultAgentId
  }, [urlAgentId, agents, defaultAgentId])

  const setAccountId = useCallback(
    (nextAccountId) => {
      const sp = new URLSearchParams()
      if (nextAccountId && nextAccountId !== defaultAccountId) {
        sp.set('account', nextAccountId)
      }

      // Account changes are a context switch, not an in-page filter change.
      // Return to a clean dashboard URL so account-specific routes, agents,
      // filters, modals, and other page-local state cannot carry across tenants.
      const query = sp.toString()
      navigate({ pathname: '/', search: query ? `?${query}` : '' })
    },
    [navigate, defaultAccountId],
  )

  const setAgentId = useCallback(
    (nextAgentId) => {
      setSearchParams((prev) => {
        const sp = new URLSearchParams(prev)
        if (!nextAgentId || nextAgentId === defaultAgentId) sp.delete('agent')
        else sp.set('agent', nextAgentId)
        return sp
      })
    },
    [setSearchParams, defaultAgentId],
  )

  return {
    accounts,
    account,
    agents,
    accountId,
    agentId,            // 'all' or a specific model_id
    isAllAgents: agentId === 'all',
    selectedAgent: agentId === 'all' ? null : agents.find((a) => a.id === agentId) ?? null,
    setAccountId,
    setAgentId,
  }
}
