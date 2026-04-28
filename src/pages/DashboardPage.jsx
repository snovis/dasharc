import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import FilterBar from '../components/dashboard/FilterBar'
import CallOutcomesChart from '../components/charts/CallOutcomesChart'
import CallsOverTime from '../components/charts/CallsOverTime'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import ProgressBar from '../components/ui/ProgressBar'
import { useAgents, useCalls, periodToDateRange } from '../hooks/useCallData'
import {
  aggregateOutcomesByAgent,
  aggregateCallsByBucket,
  granularityForRange,
  enumerateBuckets,
  padBuckets,
} from '../lib/synthflow'

function defaultFilter() {
  return { period: '7days', ...periodToDateRange('7days') }
}

export default function DashboardPage() {
  const [filter, setFilter] = useState(defaultFilter)
  const { fromDate, toDate } = filter
  const navigate = useNavigate()

  const agentsQ = useAgents()
  const agents = agentsQ.data ?? []

  // With a typical deployment targeting a single agent, we fetch its calls directly.
  // Multi-agent deployments would fan out; for now we just use the first agent.
  const primaryAgent = agents[0]
  const callsQ = useCalls({
    agentId: primaryAgent?.model_id,
    fromDate,
    toDate,
  })
  const calls = callsQ.data ?? []

  const outcomesData = useMemo(
    () => aggregateOutcomesByAgent(calls, agents),
    [calls, agents],
  )
  const granularity = useMemo(
    () => granularityForRange(fromDate, toDate),
    [fromDate, toDate],
  )
  const overTimeData = useMemo(() => {
    const aggregated = aggregateCallsByBucket(calls, granularity)
    const skeleton = enumerateBuckets(fromDate, toDate, granularity)
    return padBuckets(skeleton, aggregated)
  }, [calls, granularity, fromDate, toDate])

  function handleAgentClick(row) {
    if (row?.agentId) navigate(`/agents/${row.agentId}`)
  }

  const loading = agentsQ.isPending || (primaryAgent && callsQ.isPending)
  const error = agentsQ.isError || callsQ.isError

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Call Activity Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {agents.length > 1 ? 'Click any agent row to drill into their calls' : 'Live data from Synthflow'}
            </p>
          </div>
          <FilterBar filter={filter} onChange={setFilter} />
        </div>

        {error && (
          <ErrorBanner error={agentsQ.error || callsQ.error} />
        )}

        <SummaryStats calls={calls} loading={loading} />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card title="Call Outcomes" subtitle={filterLabel(filter)}>
            {loading ? (
              <ProgressBar loaded={callsQ.progress?.loaded ?? 0} total={callsQ.progress?.total ?? 0} />
            ) : (
              <CallOutcomesChart
                data={outcomesData}
                onAgentClick={agents.length > 1 ? handleAgentClick : undefined}
              />
            )}
          </Card>

          <Card title="Calls Over Time" subtitle={`${filterLabel(filter)} · ${granularityLabel(granularity)}`}>
            {loading ? (
              <ProgressBar loaded={callsQ.progress?.loaded ?? 0} total={callsQ.progress?.total ?? 0} />
            ) : (
              <CallsOverTime data={overTimeData} />
            )}
          </Card>
        </div>

        {agents.length === 1 && primaryAgent && (
          <Card title={`${primaryAgent.name}`} subtitle="Open call log">
            <button
              onClick={() => navigate(`/agents/${primaryAgent.model_id}`)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View all calls →
            </button>
          </Card>
        )}
      </div>
    </Layout>
  )
}

function filterLabel(filter) {
  if (filter.period === 'custom') {
    if (filter.fromDate === filter.toDate) return formatYmd(filter.fromDate)
    return `${formatYmd(filter.fromDate)} – ${formatYmd(filter.toDate)}`
  }
  return {
    today: 'Today',
    '7days': 'Last 7 days',
    '30days': 'Last 30 days',
    all: 'All time',
  }[filter.period] ?? filter.period
}

function granularityLabel(granularity) {
  return {
    hour: 'by hour',
    day: 'by day',
    week: 'by week',
    month: 'by month',
  }[granularity] ?? 'by day'
}

function formatYmd(ymd) {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const date = new Date(y, m - 1, d)
  const thisYear = new Date().getFullYear()
  const opts = y === thisYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return date.toLocaleDateString('en-US', opts)
}

function SummaryStats({ calls, loading }) {
  const totals = useMemo(() => {
    const total = calls.length
    let completed = 0, voicemail = 0, noAnswer = 0
    for (const c of calls) {
      if (c.call_status === 'completed') completed++
      else if (c.call_status === 'left_voicemail' || c.call_status === 'hangup_on_voicemail') voicemail++
      else if (c.call_status === 'no-answer') noAnswer++
    }
    return { total, completed, voicemail, noAnswer }
  }, [calls])

  const connectRate = totals.total > 0 ? Math.round((totals.completed / totals.total) * 100) : 0
  const vmRate = totals.total > 0 ? Math.round((totals.voicemail / totals.total) * 100) : 0

  const stats = [
    { label: 'Total Calls', value: loading ? '—' : totals.total.toLocaleString() },
    { label: 'Completed', value: loading ? '—' : totals.completed.toLocaleString(), sub: `${connectRate}% connect rate` },
    { label: 'Voicemail', value: loading ? '—' : totals.voicemail.toLocaleString(), sub: `${vmRate}% of calls` },
    { label: 'No Answer', value: loading ? '—' : totals.noAnswer.toLocaleString() },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400 font-medium">{s.label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</p>
          {s.sub && <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}

function ErrorBanner({ error }) {
  const status = error?.status
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
      <p className="font-medium mb-1">Failed to load data</p>
      <p className="text-xs text-red-600">
        {status === 401 && 'Your session has expired. Please sign in again.'}
        {status === 403 && 'Your email is not authorized for this deployment.'}
        {!status && (error?.message || 'Unknown error.')}
      </p>
    </div>
  )
}
