import { useParams, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import Card from '../components/ui/Card'
import { mockCalls } from '../mock/callData'

// ─── OPEN DESIGN QUESTION ────────────────────────────────────────────────────
// How does the dashboard access call recordings and transcripts from Synthflow?
// Options:
//   A) n8n pulls audio URLs + transcript from Synthflow API → writes to Firebase
//   B) Dashboard deep-links into Synthflow UI for playback/transcript
//   C) Hybrid — metadata in Firebase, playback link out to Synthflow
//
// This page is a placeholder. The call metadata (outcome, duration, contact)
// is fully functional. Audio and transcript are blocked on the above decision.
// ─────────────────────────────────────────────────────────────────────────────

const OUTCOME_LABELS = {
  no_answer: 'No answer',
  no_value: 'No value',
  left_voicemail: 'Left voicemail',
  connected: 'Connected',
}

function formatDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function CallDetailPage() {
  const { callId } = useParams()
  const navigate = useNavigate()

  const call = mockCalls.find(c => c.id === callId)

  if (!call) {
    return (
      <Layout>
        <div className="px-8 py-6">
          <p className="text-slate-500">Call not found.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="px-8 py-6 space-y-6 max-w-3xl">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-slate-400 hover:text-slate-600 mb-2 flex items-center gap-1"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Call Detail</h1>
        </div>

        {/* Metadata */}
        <Card title="Call Information">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            {[
              { label: 'Agent', value: call.agentName },
              { label: 'Contact', value: call.contactName },
              { label: 'Phone', value: call.contactPhone },
              { label: 'Outcome', value: OUTCOME_LABELS[call.outcome] || '—' },
              { label: 'Duration', value: formatDuration(call.duration) },
              { label: 'Date / Time', value: new Date(call.timestamp).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <dt className="text-xs text-slate-400 mb-0.5">{label}</dt>
                <dd className="font-medium text-slate-800">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Audio — placeholder */}
        <Card title="Recording">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
            <p className="font-medium mb-1">Pending: Synthflow integration</p>
            <p className="text-xs text-amber-600">
              Call audio will appear here once we determine how recordings are accessed from Synthflow.
              See open design question in <code className="bg-amber-100 px-1 rounded">src/pages/CallDetailPage.jsx</code>.
            </p>
          </div>
        </Card>

        {/* Transcript — placeholder */}
        <Card title="Transcript">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
            <p className="font-medium mb-1">Pending: Synthflow integration</p>
            <p className="text-xs text-amber-600">
              Call transcript will appear here once the Synthflow audio/transcript access pattern is resolved.
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  )
}
