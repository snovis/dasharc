#!/usr/bin/env node
// Local test harness for /api/ingest.
// Usage:
//   INGEST_URL=https://your-vercel-url/api/ingest INGEST_SECRET=xxx node scripts/test-ingest.mjs
//   node scripts/test-ingest.mjs initiated          # only initiated
//   node scripts/test-ingest.mjs completed          # only completed
//   node scripts/test-ingest.mjs both               # default — both, ~500ms apart
//
// Defaults target http://localhost:3000/api/ingest (Vercel dev) with secret "dev-secret".

import { randomUUID } from 'node:crypto'

const URL = process.env.INGEST_URL || 'http://localhost:3000/api/ingest'
const SECRET = process.env.INGEST_SECRET || 'dev-secret'
const phase = process.argv[2] || 'both'

const callId = `test-${randomUUID()}`
const startedAt = new Date().toISOString()
const completedAt = new Date(Date.now() + 142_000).toISOString()

const initiated = {
  type: 'initiated',
  call_id: callId,
  phone: '+16025551234',
  campaign: 'AZ_CrossSell',
  leadId: 'TEST_LEAD_001',
  firstName: 'Test',
  lastName: 'Patient',
  company: 'Test Clinic',
  state: 'AZ',
  areaCode: '602',
  startedAt,
}

const completed = {
  type: 'completed',
  call_id: callId,
  synthflowStatus: 'completed',
  duration: 142,
  endReason: 'user_hangup',
  recordingUrl: 'https://example.com/rec/test.mp3',
  transcript: 'Agent: Hi Test, this is a test call. User: Sure, tell me more.',
  modelId: '0df733c4-a8fb-4d14-a12a-55fc62396bc7',
  completedAt,
  phone: '+16025551234',
}

async function post(label, body) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Ingest-Secret': SECRET,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log(`${label.padEnd(10)} ${res.status} ${text}`)
  return res.ok
}

console.log(`URL:      ${URL}`)
console.log(`call_id:  ${callId}\n`)

if (phase === 'initiated' || phase === 'both') {
  await post('initiated', initiated)
}
if (phase === 'completed' || phase === 'both') {
  if (phase === 'both') await new Promise((r) => setTimeout(r, 500))
  await post('completed', completed)
}

console.log(`\nVerify in Firestore: calls/${callId}`)
