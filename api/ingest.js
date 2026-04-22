import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc } from 'firebase/firestore'
import { timingSafeEqual } from 'node:crypto'

let auth
let db

function initFirebase() {
  if (getApps().length > 0) return
  const app = initializeApp({
    apiKey: process.env.VITE_FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID,
  })
  auth = getAuth(app)
  db = getFirestore(app)
}

async function ensureSignedIn() {
  if (auth.currentUser) return
  await signInWithEmailAndPassword(
    auth,
    process.env.INGEST_EMAIL,
    process.env.INGEST_PASSWORD,
  )
}

function checkSecret(header) {
  const expected = process.env.INGEST_SECRET
  if (!expected || !header) return false
  try {
    const a = Buffer.from(String(header))
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const STATUS_MAP = {
  completed: 'connected',
  hangup_on_voicemail: 'voicemail',
  'no-answer': 'no_answer',
  no_answer: 'no_answer',
  busy: 'busy',
  failed: 'failed',
}

function mapStatus(synthflowStatus) {
  return STATUS_MAP[synthflowStatus] || 'failed'
}

function toDate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function validateInitiated(body) {
  const errs = []
  if (!body.call_id) errs.push('call_id')
  if (!body.phone) errs.push('phone')
  if (!body.campaign) errs.push('campaign')
  if (!body.startedAt) errs.push('startedAt')
  return errs
}

function validateCompleted(body) {
  const errs = []
  if (!body.call_id) errs.push('call_id')
  if (!body.synthflowStatus) errs.push('synthflowStatus')
  return errs
}

function buildInitiatedDoc(body) {
  return {
    callId: body.call_id,
    phone: body.phone,
    campaign: body.campaign,
    status: 'initiated',
    startedAt: toDate(body.startedAt),
    leadId: body.leadId || null,
    firstName: body.firstName || null,
    lastName: body.lastName || null,
    company: body.company || null,
    state: body.state || null,
    areaCode: body.areaCode || null,
  }
}

function buildCompletedDoc(body) {
  return {
    callId: body.call_id,
    status: mapStatus(body.synthflowStatus),
    completedAt: toDate(body.completedAt) || new Date(),
    duration: typeof body.duration === 'number' ? body.duration : null,
    endReason: body.endReason || null,
    recordingUrl: body.recordingUrl || null,
    transcript: body.transcript ? String(body.transcript).slice(0, 32000) : null,
    modelId: body.modelId || null,
    ...(body.phone ? { phone: body.phone } : {}),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!checkSecret(req.headers['x-ingest-secret'])) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'invalid_json' })
  }

  const { type } = body
  if (type !== 'initiated' && type !== 'completed') {
    return res
      .status(400)
      .json({ error: 'invalid_type', detail: 'type must be "initiated" or "completed"' })
  }

  const errs = type === 'initiated' ? validateInitiated(body) : validateCompleted(body)
  if (errs.length) {
    return res.status(400).json({ error: 'missing_fields', fields: errs })
  }

  try {
    initFirebase()
    await ensureSignedIn()
    const payload = type === 'initiated' ? buildInitiatedDoc(body) : buildCompletedDoc(body)
    await setDoc(doc(db, 'calls', body.call_id), payload, { merge: true })
    return res.status(200).json({ ok: true, callId: body.call_id, type })
  } catch (err) {
    console.error('[ingest] write failed', {
      type,
      callId: body.call_id,
      message: err?.message,
    })
    return res.status(500).json({ error: 'write_failed' })
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s)
  } catch {
    return null
  }
}
