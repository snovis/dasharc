import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Card from '../components/ui/Card'
import Spinner from '../components/ui/Spinner'
import { useCall } from '../hooks/useCallData'
import {
  callTimestamp,
  formatDateTime,
  formatDuration,
  normalizeStatus,
  outcomeLabel,
  outcomePillClass,
  parseTranscript,
} from '../lib/synthflow'

export default function CallDetailPage() {
  const { callId } = useParams()
  const navigate = useNavigate()
  const { data: call, isPending, isError, error } = useCall(callId)

  if (isPending) {
    return (
      <Layout>
        <div className="px-8 py-6 flex justify-center">
          <Spinner size="lg" />
        </div>
      </Layout>
    )
  }

  if (isError || !call) {
    return (
      <Layout>
        <div className="px-8 py-6 space-y-2 max-w-3xl">
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Call not found</h1>
          <p className="text-sm text-slate-500">
            {error?.status === 404
              ? 'This call does not exist or is not part of this deployment.'
              : error?.message || 'Failed to load call.'}
          </p>
        </div>
      </Layout>
    )
  }

  const bucket = normalizeStatus(call.call_status)
  const timestamp = callTimestamp(call)
  const transcriptSegments = parseTranscript(call.transcript)

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6 max-w-4xl">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
          >
            ← Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">Call Detail</h1>
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${outcomePillClass(bucket)}`}
            >
              {outcomeLabel(bucket)}
            </span>
          </div>
        </div>

        <Card title="Call Information">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: 'Lead', value: call.lead_name || '—' },
              { label: 'Phone', value: call.lead_phone_number || '—' },
              { label: 'Direction', value: call.type_of_call || '—' },
              { label: 'Duration', value: formatDuration(call.duration) },
              { label: 'Date / Time', value: formatDateTime(timestamp) },
              { label: 'Hangup by', value: call.telephony_hangup || '—' },
              { label: 'Agent phone', value: call.agent_phone_number || call.phone_number_from || '—' },
              { label: 'End reason', value: call.telephony_disconnect_reason || call.end_call_reason || '—' },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-slate-400 mb-0.5">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Recording">
          {call.recording_url ? (
            <audio
              controls
              src={call.recording_url}
              className="w-full"
              preload="metadata"
            >
              Your browser does not support the audio element.
            </audio>
          ) : (
            <p className="text-slate-400 text-sm">No recording available.</p>
          )}
        </Card>

        <Card title="Transcript">
          {transcriptSegments.length === 0 ? (
            <p className="text-slate-400 text-sm">No transcript available for this call.</p>
          ) : (
            <div className="space-y-3">
              {transcriptSegments.map((seg, i) => (
                <TranscriptSegment key={i} role={seg.role} text={seg.text} />
              ))}
            </div>
          )}
        </Card>

        {call.judge_results && Object.keys(call.judge_results).length > 0 && (
          <JudgeResults judge={call.judge_results} />
        )}
      </div>
    </Layout>
  )
}

function TranscriptSegment({ role, text }) {
  const isHuman = role === 'human'
  return (
    <div className={`flex gap-3 ${isHuman ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
          isHuman
            ? 'bg-slate-100 text-slate-800 rounded-bl-sm'
            : 'bg-blue-600 text-white rounded-br-sm'
        }`}
      >
        <p className="text-xs uppercase tracking-wide mb-0.5 opacity-60">{role}</p>
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

// Judge results — surfaces the most useful booleans and all feedback strings.
const JUDGE_BOOL_FIELDS = [
  { key: 'answered_by_human',    label: 'Answered by human' },
  { key: 'opted_in',             label: 'Opted in' },
  { key: 'no_opt_out',           label: 'No opt-out' },
  { key: 'call_completion',      label: 'Call completed normally' },
  { key: 'goal',                 label: 'Goal achieved' },
  { key: 'persona',              label: 'Persona consistent' },
  { key: 'agent_sentiment',      label: 'Agent sentiment positive' },
  { key: 'call_summary',         label: 'Summary generated' },
]

function judgeBool(v) {
  if (v === true || v === 'true' || v === 'True') return true
  if (v === false || v === 'false' || v === 'False') return false
  return null
}

function JudgeResults({ judge }) {
  const [open, setOpen] = useState(false)
  const feedbackEntries = Object.entries(judge)
    .filter(([k, v]) => k.endsWith('_feedback') && typeof v === 'string' && v.trim().length > 0)

  return (
    <Card title="AI Quality Assessment">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {JUDGE_BOOL_FIELDS.map(({ key, label }) => {
          const bool = judgeBool(judge[key])
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  bool === true ? 'bg-emerald-500' :
                  bool === false ? 'bg-red-500' : 'bg-slate-300'
                }`}
              />
              <span className="text-slate-600">{label}</span>
              <span className="ml-auto text-xs text-slate-400">
                {bool === true ? 'yes' : bool === false ? 'no' : '—'}
              </span>
            </div>
          )
        })}
      </div>

      {judge.user_sentiment && (
        <div className="mt-4 pt-4 border-t border-slate-100 text-sm">
          <span className="text-xs text-slate-400">User sentiment:</span>{' '}
          <span className="font-medium text-slate-800">{judge.user_sentiment}</span>
        </div>
      )}

      {feedbackEntries.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <button
            onClick={() => setOpen(!open)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {open ? 'Hide detailed feedback' : `Show detailed feedback (${feedbackEntries.length})`}
          </button>
          {open && (
            <dl className="mt-4 space-y-3">
              {feedbackEntries.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-xs text-slate-400 uppercase tracking-wide mb-1">
                    {key.replace(/_feedback$/, '').replace(/_/g, ' ')}
                  </dt>
                  <dd className="text-sm text-slate-700">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </Card>
  )
}
