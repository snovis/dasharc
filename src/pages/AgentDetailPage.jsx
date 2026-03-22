import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import FilterBar from '../components/dashboard/FilterBar'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import { useAgentCalls } from '../hooks/useCallData'
import { mockCalls } from '../mock/callData'

const OUTCOME_LABELS = {
  no_answer: 'No answer',
  no_value: 'No value',
  left_voicemail: 'Left voicemail',
  connected: 'Connected',
}

const OUTCOME_COLORS = {
  no_answer: 'bg-orange-100 text-orange-700',
  no_value: 'bg-slate-100 text-slate-600',
  left_voicemail: 'bg-blue-100 text-blue-700',
  connected: 'bg-emerald-100 text-emerald-700',
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function AgentDetailPage() {
  const { agentId } = useParams()
  const navigate = useNavigate()
  const [period, setPeriod] = useState('7days')

  // Get agent name from mock data (will come from Firestore later)
  const agentName = mockCalls.find(c => c.agentId === agentId)?.agentName || agentId

  const { data: calls, isPending, isError } = useAgentCalls(agentId, period)

  const connected = calls?.filter(c => c.outcome === 'connected').length || 0
  const total = calls?.length || 0
  const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
            >
              ← Back to dashboard
            </button>
            <h1 className="text-xl font-semibold text-slate-900">{agentName}</h1>
            <p className="text-sm text-slate-400 mt-0.5">Call history</p>
          </div>
          <FilterBar period={period} onChange={setPeriod} />
        </div>

        {/* Stats */}
        {!isPending && calls && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Total Calls', value: total },
              { label: 'Connected', value: connected },
              { label: 'Connect Rate', value: `${connectRate}%` },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <p className="text-xs text-slate-400">{s.label}</p>
                <p className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Call log */}
        <Card title="Call Log">
          {isPending ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : isError ? (
            <p className="text-red-500 text-sm">Failed to load calls.</p>
          ) : calls?.length === 0 ? (
            <p className="text-slate-400 text-sm">No calls in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-3 font-medium">Date</th>
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Contact</th>
                    <th className="pb-3 font-medium">Outcome</th>
                    <th className="pb-3 font-medium">Duration</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {calls.map(call => (
                    <tr
                      key={call.id}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/calls/${call.id}`)}
                    >
                      <td className="py-2.5 text-slate-600">{formatDate(call.timestamp)}</td>
                      <td className="py-2.5 text-slate-500">{formatTime(call.timestamp)}</td>
                      <td className="py-2.5 text-slate-800 font-medium">{call.contactName}</td>
                      <td className="py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${OUTCOME_COLORS[call.outcome] || 'bg-slate-100 text-slate-600'}`}>
                          {OUTCOME_LABELS[call.outcome] || call.outcome || '—'}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-500">{formatDuration(call.duration)}</td>
                      <td className="py-2.5 text-slate-300 text-xs">View →</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  )
}
