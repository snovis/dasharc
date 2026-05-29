import { useMe } from '../../hooks/useMe'
import { useSelection } from '../../hooks/useSelection'

// Account-level selector that lives in the sidebar.
// Collapsed to plain text when the user only has one account.
export function AccountSelector() {
  const { data: me, isPending } = useMe()
  const { accounts, accountId, setAccountId } = useSelection()

  if (isPending || !me) {
    return <div className="text-slate-400 text-xs">Loading…</div>
  }

  if (accounts.length === 0) {
    return <div className="text-amber-400 text-xs">No accounts assigned</div>
  }

  if (accounts.length === 1) {
    return (
      <div className="text-slate-300 text-xs font-medium truncate" title={accounts[0].name}>
        {accounts[0].name}
      </div>
    )
  }

  return (
    <select
      value={accountId ?? ''}
      onChange={(e) => setAccountId(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  )
}

// Agent-level selector for the page header (dashboard only).
// Hidden when the selected account has just one agent.
export function AgentSelector() {
  const { agents, agentId, setAgentId } = useSelection()

  if (agents.length <= 1) return null

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="text-slate-400">Agent:</span>
      <select
        value={agentId}
        onChange={(e) => setAgentId(e.target.value)}
        className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        <option value="all">All agents</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  )
}

// Tiny "viewing as support" pill — only renders when a wildcard/support user
// is looking at a specific account (so Daniel/Nicole don't mistake the view
// for their own data).
export function SupportBadge() {
  const { data: me } = useMe()
  if (!me?.is_support) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      viewing as support
    </span>
  )
}
