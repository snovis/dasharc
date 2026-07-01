import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import FilterBar from '../components/dashboard/FilterBar'
import Card from '../components/ui/Card'
import ProgressBar from '../components/ui/ProgressBar'
import { useDallasCalls, useDallasStats, periodToDateRange } from '../hooks/useCallData'
import { useSelection } from '../hooks/useSelection'
import { formatDate, formatTime, formatDuration } from '../lib/synthflow'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest duration' },
  { value: 'shortest', label: 'Shortest duration' },
]

function callTs(call) {
  if (!call.start_time) return null
  const d = new Date(call.start_time)
  return isNaN(d.getTime()) ? null : d
}

function statusPillClass(status) {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-700'
    case 'busy': return 'bg-yellow-100 text-yellow-700'
    case 'failed': return 'bg-red-100 text-red-700'
    case 'no-answer': return 'bg-slate-100 text-slate-500'
    default: return 'bg-slate-100 text-slate-500'
  }
}

export default function DallasRvmPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { account, accountId } = useSelection()
  const campaign = account?.rvm_campaign

  const period = searchParams.get('period') ?? '7days'
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const sortBy = searchParams.get('sort') ?? 'newest'

  function updateParam(key, value, defaultValue) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === defaultValue) next.delete(key)
      else next.set(key, value)
      return next
    })
  }
  const setSortBy = (v) => updateParam('sort', v, 'newest')

  const filter = useMemo(() => {
    if (period === 'custom' && fromParam && toParam) {
      return { period: 'custom', fromDate: fromParam, toDate: toParam }
    }
    return { period, ...periodToDateRange(period) }
  }, [period, fromParam, toParam])

  function setFilter(next) {
    setSearchParams((prev) => {
      const sp = new URLSearchParams(prev)
      if (next.period === 'custom') {
        sp.set('period', 'custom')
        sp.set('from', next.fromDate)
        sp.set('to', next.toDate)
      } else {
        if (next.period === '7days') sp.delete('period')
        else sp.set('period', next.period)
        sp.delete('from')
        sp.delete('to')
      }
      return sp
    })
  }

  const { fromDate, toDate } = filter

  const callsQ = useDallasCalls({
    accountId: campaign ? accountId : null,
    fromDate,
    toDate,
  })
  const calls = useMemo(() => callsQ.data ?? [], [callsQ.data])

  const statsQ = useDallasStats({ fromDate, toDate })
  const stats = statsQ.data ?? null

  const displayedCalls = useMemo(() => {
    return [...calls].sort((a, b) => {
      if (sortBy === 'longest' || sortBy === 'shortest') {
        const da = Number(a.duration || 0)
        const db = Number(b.duration || 0)
        return sortBy === 'longest' ? db - da : da - db
      }
      const ta = callTs(a)?.getTime() ?? 0
      const tb = callTs(b)?.getTime() ?? 0
      return sortBy === 'oldest' ? ta - tb : tb - ta
    })
  }, [calls, sortBy])

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
              {campaign?.name || 'RVM Campaign'}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {campaign?.subtitle || 'Ringless voicemail call history'}
            </p>
          </div>
          <FilterBar filter={filter} onChange={setFilter} />
        </div>

        {!campaign ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            The selected account does not have an RVM campaign configured.
          </div>
        ) : (
          <>
            {/* Twilio call stats */}
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

            {/* Campaign stats from Salesforce */}
            <div className="grid grid-cols-4 gap-4">
              {statsQ.isPending ? (
                <div className="col-span-4 text-sm text-slate-400">Loading campaign stats...</div>
              ) : statsQ.isError ? (
                <div className="col-span-4 text-sm text-red-500">Failed to load campaign stats</div>
              ) : stats ? (
                [
                  { label: 'Contacts Reached', value: stats.contactsReached?.toLocaleString() ?? '—', color: 'text-blue-600' },
                  { label: 'Voicemails Left', value: stats.voicemailsLeft?.toLocaleString() ?? '—', color: 'text-purple-600' },
                  { label: 'SMS Sent', value: stats.smsSent?.toLocaleString() ?? '—', color: 'text-green-600' },
                  { label: 'Emails Sent', value: stats.emailsSent?.toLocaleString() ?? '—', color: 'text-orange-600' },
                ].map((s) => (
                  <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                    <p className="text-xs text-slate-400">{s.label}</p>
                    <p className={`text-2xl font-semibold mt-1 ${s.color}`}>{s.value}</p>
                  </div>
                ))
              ) : null}
            </div>

            {/* Call log table */}
            <Card title="RVM Call Log">
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                          <th className="pb-3 font-medium">Date</th>
                          <th className="pb-3 font-medium">Time</th>
                          <th className="pb-3 font-medium">Phone</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {displayedCalls.map((call) => {
                          const t = callTs(call)
                          return (
                            <tr key={call.call_id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 text-slate-600">{formatDate(t)}</td>
                              <td className="py-2.5 text-slate-500">{formatTime(t)}</td>
                              <td className="py-2.5 text-slate-500 font-mono text-xs">
                                {call.lead_phone_number || '—'}
                              </td>
                              <td className="py-2.5">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(call.call_status)}`}>
                                  {call.call_status || '—'}
                                </span>
                              </td>
                              <td className="py-2.5 text-slate-500">
                                {formatDuration(call.duration)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </>
        )}
      </div>
    </Layout>
  )
}
