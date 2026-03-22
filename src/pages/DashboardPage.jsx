import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import FilterBar from '../components/dashboard/FilterBar'
import CallOutcomesChart from '../components/charts/CallOutcomesChart'
import ActivityLeaderboard from '../components/charts/ActivityLeaderboard'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import { useCallOutcomes, useActivityLeaderboard } from '../hooks/useCallData'

export default function DashboardPage() {
  const [period, setPeriod] = useState('7days')
  const navigate = useNavigate()

  const outcomes = useCallOutcomes(period)
  const activity = useActivityLeaderboard(period)

  function handleAgentClick(agent) {
    if (agent?.agentId) navigate(`/agents/${agent.agentId}`)
  }

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Call Activity Dashboard</h1>
            <p className="text-sm text-slate-400 mt-0.5">Click any agent row to drill into their calls</p>
          </div>
          <FilterBar period={period} onChange={setPeriod} />
        </div>

        {/* Summary stats */}
        <SummaryStats outcomesData={outcomes.data} activityData={activity.data} />

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card
            title="Call Outcomes by Rep"
            subtitle={periodLabel(period)}
          >
            {outcomes.isPending ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : outcomes.isError ? (
              <p className="text-red-500 text-sm">Failed to load data.</p>
            ) : (
              <CallOutcomesChart data={outcomes.data} onAgentClick={handleAgentClick} />
            )}
          </Card>

          <Card
            title="Activity Leaderboard by Rep"
            subtitle={periodLabel(period)}
          >
            {activity.isPending ? (
              <div className="flex justify-center py-12"><Spinner /></div>
            ) : activity.isError ? (
              <p className="text-red-500 text-sm">Failed to load data.</p>
            ) : (
              <ActivityLeaderboard data={activity.data} onAgentClick={handleAgentClick} />
            )}
          </Card>
        </div>
      </div>
    </Layout>
  )
}

function periodLabel(period) {
  return { today: 'Today', '7days': 'Last 7 days', '30days': 'Last 30 days' }[period]
}

function SummaryStats({ outcomesData, activityData }) {
  if (!outcomesData || !activityData) return null

  const totalCalls = outcomesData.reduce((s, a) => s + a.total, 0)
  const connected = outcomesData.reduce((s, a) => s + a.connected, 0)
  const connectRate = totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0
  const totalActivities = activityData.reduce((s, a) => s + a.total, 0)
  const activeAgents = outcomesData.length

  const stats = [
    { label: 'Total Calls', value: totalCalls.toLocaleString() },
    { label: 'Connected', value: connected.toLocaleString(), sub: `${connectRate}% connect rate` },
    { label: 'Total Activities', value: totalActivities.toLocaleString() },
    { label: 'Active Agents', value: activeAgents },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map(s => (
        <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-400 font-medium">{s.label}</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{s.value}</p>
          {s.sub && <p className="text-xs text-slate-400 mt-0.5">{s.sub}</p>}
        </div>
      ))}
    </div>
  )
}
