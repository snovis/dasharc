import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const ACTIVITIES = [
  { key: 'call',  label: 'Call',              color: '#3b82f6' },
  { key: 'email', label: 'Email',             color: '#8b5cf6' },
  { key: 'note',  label: 'Note',              color: '#f59e0b' },
  { key: 'task',  label: 'Task',              color: '#10b981' },
]

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0)
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-48">
      <p className="font-semibold text-slate-800 mb-2">{label}</p>
      <p className="text-slate-400 mb-1">(Count) Activities</p>
      {payload.map(p => {
        const pct = total > 0 ? Math.round((p.value / total) * 100) : 0
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
              <span className="text-slate-600">{p.name}</span>
            </div>
            <span className="font-medium text-slate-800">{p.value} <span className="text-slate-400">({pct}%)</span></span>
          </div>
        )
      })}
      <div className="border-t border-slate-100 mt-2 pt-2 flex justify-between font-semibold text-slate-700">
        <span>Totals:</span><span>{total}</span>
      </div>
    </div>
  )
}

export default function ActivityLeaderboard({ data, onAgentClick }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 52)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
        barCategoryGap="28%"
      >
        <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 12, fill: '#475569', cursor: 'pointer' }}
          tickLine={false}
          axisLine={false}
          onClick={(e) => onAgentClick && onAgentClick(data.find(d => d.name === e.value))}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9' }} />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12, color: '#64748b', paddingTop: 12 }}
        />
        {ACTIVITIES.map(a => (
          <Bar
            key={a.key}
            dataKey={a.key}
            name={a.label}
            stackId="a"
            fill={a.color}
            radius={a.key === 'task' ? [0, 3, 3, 0] : 0}
            style={{ cursor: onAgentClick ? 'pointer' : 'default' }}
            onClick={(entry) => onAgentClick && onAgentClick(entry)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
