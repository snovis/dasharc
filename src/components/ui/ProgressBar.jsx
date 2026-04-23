export default function ProgressBar({ loaded, total, label = 'calls' }) {
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
  return (
    <div className="w-full max-w-md mx-auto py-6 space-y-2">
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-[width] duration-200 ease-out"
          style={{ width: `${pct || 5}%` }}
        />
      </div>
      <p className="text-xs text-slate-500 text-center">
        {total > 0
          ? `Loaded ${loaded.toLocaleString()} of ${total.toLocaleString()} ${label}…`
          : `Loading ${label}…`}
      </p>
    </div>
  )
}
