import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import FilterBar from '../components/dashboard/FilterBar'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import ProgressBar from '../components/ui/ProgressBar'
import {
  useAgents,
  useCalls,
  periodToDateRange,
} from '../hooks/useCallData'
import {
  callTimestamp,
  formatDate,
  formatTime,
  formatDuration,
  normalizeStatus,
  outcomeLabel,
  outcomePillClass,
  OUTCOME_BUCKETS,
} from '../lib/synthflow'

const SORT_OPTIONS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'longest',  label: 'Longest duration' },
  { value: 'shortest', label: 'Shortest duration' },
]

export default function AgentDetailPage() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('7days')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('newest')

  const agentsQ = useAgents()
  const agent = agentsQ.data?.find((a) => a.model_id === agentId)

  const { fromDate, toDate } = useMemo(() => periodToDateRange(period), [period])
  const callsQ = useCalls({ agentId, fromDate, toDate })

  const calls = callsQ.data ?? []

  const displayedCalls = useMemo(() => {
    let result = filterStatus === 'all'
      ? calls
      : calls.filter((c) => normalizeStatus(c.call_status) === filterStatus)
    result = [...result].sort((a, b) => {
      if (sortBy === 'longest' || sortBy === 'shortest') {
        const da = Number(a.duration || 0)
        const db = Number(b.duration || 0)
        return sortBy === 'longest' ? db - da : da - db
      }
      const ta = callTimestamp(a)?.getTime() ?? 0
      const tb = callTimestamp(b)?.getTime() ?? 0
      return sortBy === 'oldest' ? ta - tb : tb - ta
    })
    return result
  }, [calls, filterStatus, sortBy])

  const total = calls.length
  const completed = calls.filter((c) => c.call_status === 'completed').length
  const connectRate = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
            >
              ← Back to dashboard
            </button>
            <h1 className="text-xl font-semibold text-slate-900">
              {agent?.name || agentId}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {agent?.type === 'outbound' ? 'Outbound' : agent?.type === 'inbound' ? 'Inbound' : 'Agent'} · Call history
            </p>
          </div>
          <FilterBar period={period} onChange={setPeriod} />
        </div>

        {!callsQ.isPending && !callsQ.isError && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Calls', value: total.toLocaleString() },
              { label: 'Completed', value: completed.toLocaleString() },
              { label: 'Connect Rate', value: `${connectRate}%` },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <Card title="Call Log">
          {callsQ.isPending ? (
            <ProgressBar loaded={callsQ.progress?.loaded ?? 0} total={callsQ.progress?.total ?? 0} />
          ) : callsQ.isError ? (
            <p className="text-red-500 text-sm">Failed to load calls: {callsQ.error?.message}</p>
          ) : calls.length === 0 ? (
            <p className="text-slate-400 text-sm">No calls in this period.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 pb-4 border-b border-slate-100 mb-2 text-xs">
                <label className="flex items-center gap-2 text-slate-500">
                  <span className="text-slate-400">Filter:</span>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="all">All outcomes</option>
                    {OUTCOME_BUCKETS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-slate-500">
                  <span className="text-slate-400">Sort:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <span className="text-slate-400 ml-auto">
                  Showing {displayedCalls.length.toLocaleString()} of {calls.length.toLocaleString()}
                </span>
              </div>
              {displayedCalls.length === 0 ? (
                <p className="text-slate-400 text-sm py-8 text-center">No calls match the current filter.</p>
              ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Contact</th>
                    <th className="pb-3 font-medium">Phone</th>
                    <th className="pb-3 font-medium">Outcome</th>
                    <th className="pb-3 font-medium">Duration</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {displayedCalls.map((call) => {
                    const t = callTimestamp(call)
                    const bucket = normalizeStatus(call.call_status)
                    return (
                      <tr
                        key={call.call_id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/calls/${call.call_id}`)}
                      >
                        <td className="py-2.5 text-slate-600">{formatDate(t)}</td>
                        <td className="py-2.5 text-slate-500">{formatTime(t)}</td>
                        <td className="py-2.5 text-slate-800 font-medium">
                          {call.lead_name || '—'}
                        </td>
                        <td className="py-2.5 text-slate-500 font-mono text-xs">
                          {call.lead_phone_number || '—'}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${outcomePillClass(bucket)}`}
                          >
                            {outcomeLabel(bucket)}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {formatDuration(call.duration)}
                        </td>
                        <td className="py-2.5 text-slate-300 text-xs">View →</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
              )}
            </>
          )}
        </Card>
      </div>
    </Layout>
  )
}
