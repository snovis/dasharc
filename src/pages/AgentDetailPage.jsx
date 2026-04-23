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
} from '../lib/synthflow'

export default function AgentDetailPage() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('7days')

  const agentsQ = useAgents()
  const agent = agentsQ.data?.find((a) => a.model_id === agentId)

  const { fromDate, toDate } = useMemo(() => periodToDateRange(period), [period])
  const callsQ = useCalls({ agentId, fromDate, toDate })

  const calls = callsQ.data ?? []
  const sortedCalls = useMemo(
    () => [...calls].sort((a, b) => {
      const ta = callTimestamp(a)?.getTime() ?? 0
      const tb = callTimestamp(b)?.getTime() ?? 0
      return tb - ta
    }),
    [calls],
  )

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
          ) : sortedCalls.length === 0 ? (
            <p className="text-slate-400 text-sm">No calls in this period.</p>
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
                  {sortedCalls.map((call) => {
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
        </Card>
      </div>
    </Layout>
  )
}
