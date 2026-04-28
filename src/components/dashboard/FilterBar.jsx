import { useEffect, useRef, useState } from 'react'
import { periodToDateRange } from '../../hooks/useCallData'

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: '30days', label: 'Last 30 Days' },
]

export default function FilterBar({ filter, onChange }) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const popoverRef = useRef(null)
  const customBtnRef = useRef(null)

  useEffect(() => {
    if (!popoverOpen) return
    function onDocMouseDown(e) {
      if (popoverRef.current?.contains(e.target)) return
      if (customBtnRef.current?.contains(e.target)) return
      setPopoverOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popoverOpen])

  function pickPreset(value) {
    setPopoverOpen(false)
    onChange({ period: value, ...periodToDateRange(value) })
  }

  function applyCustom(range) {
    setPopoverOpen(false)
    onChange({ period: 'custom', ...range })
  }

  const isCustom = filter.period === 'custom'
  const customLabel = isCustom
    ? formatRangeLabel(filter.fromDate, filter.toDate)
    : 'Custom'

  return (
    <div className="relative">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => pickPreset(p.value)}
            className={btnClass(filter.period === p.value)}
          >
            {p.label}
          </button>
        ))}
        <button
          ref={customBtnRef}
          onClick={() => setPopoverOpen((o) => !o)}
          className={btnClass(isCustom)}
        >
          {customLabel}
        </button>
      </div>
      {popoverOpen && (
        <CustomRangePopover
          popoverRef={popoverRef}
          initialFrom={filter.fromDate}
          initialTo={filter.toDate}
          onApply={applyCustom}
          onCancel={() => setPopoverOpen(false)}
        />
      )}
    </div>
  )
}

function btnClass(active) {
  return `px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
    active
      ? 'bg-white text-slate-900 shadow-sm'
      : 'text-slate-500 hover:text-slate-700'
  }`
}

function CustomRangePopover({ popoverRef, initialFrom, initialTo, onApply, onCancel }) {
  const [singleDay, setSingleDay] = useState(
    !!initialFrom && initialFrom === initialTo,
  )
  const [from, setFrom] = useState(initialFrom || todayYmd())
  const [to, setTo] = useState(initialTo || initialFrom || todayYmd())

  function toggleSingleDay(checked) {
    setSingleDay(checked)
    if (checked) setTo(from)
  }

  function handleFromChange(v) {
    setFrom(v)
    if (singleDay || (to && v && to < v)) setTo(v)
  }

  const finalTo = singleDay ? from : to
  const valid = !!from && !!finalTo && finalTo >= from

  function handleApply() {
    if (!valid) return
    onApply({ fromDate: from, toDate: finalTo })
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-4 w-72"
    >
      <label className="flex items-center gap-2 mb-3 select-none cursor-pointer">
        <input
          type="checkbox"
          checked={singleDay}
          onChange={(e) => toggleSingleDay(e.target.checked)}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-slate-700">Single day</span>
      </label>

      {singleDay ? (
        <DateField label="Date" value={from} onChange={handleFromChange} />
      ) : (
        <div className="space-y-2">
          <DateField
            label="Start"
            value={from}
            onChange={handleFromChange}
            max={to || undefined}
          />
          <DateField
            label="End"
            value={to}
            onChange={setTo}
            min={from || undefined}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!valid}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  )
}

function DateField({ label, value, onChange, min, max }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <input
        type="date"
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </label>
  )
}

function todayYmd() {
  return periodToDateRange('today').fromDate
}

function formatRangeLabel(fromDate, toDate) {
  if (!fromDate || !toDate) return 'Custom'
  if (fromDate === toDate) return formatYmd(fromDate)
  return `${formatYmd(fromDate)} – ${formatYmd(toDate)}`
}

function formatYmd(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const date = new Date(y, m - 1, d)
  const thisYear = new Date().getFullYear()
  const opts = y === thisYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }
  return date.toLocaleDateString('en-US', opts)
}
