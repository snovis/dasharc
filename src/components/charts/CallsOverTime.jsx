import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { OUTCOME_BUCKETS } from '../../lib/synthflow'

function formatDayTick(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-48">
      <p className="font-semibold text-slate-800 mb-2">{formatDayTick(label)}</p>
      {payload.filter((p) => p.value > 0).map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
            <span className="text-slate-600">{p.name}</span>
          </div>
          <span className="font-medium text-slate-800">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-slate-100 mt-2 pt-2 flex justify-between font-semibold text-slate-700">
        <span>Total:</span><span>{total}</span>
      </div>
    </div>
  )
}

export default function CallsOverTime({ data }) {
  if (!data || data.length === 0) {
    return <p className="text-slate-400 text-sm py-12 text-center">No calls in this period.</p>
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDayTick}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 12 }}
        />
        {OUTCOME_BUCKETS.map((o, i) => (
          <Bar
            key={o.key}
            dataKey={o.key}
            name={o.label}
            stackId="a"
            fill={o.color}
            radius={i === OUTCOME_BUCKETS.length - 1 ? [3, 3, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
