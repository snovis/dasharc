// Mock call data — mirrors the shape that Firestore records will have.
// Swap out by setting VITE_USE_MOCK_DATA=false once Firebase is wired up.

const AGENTS = [
  { id: 'agent_grace', name: 'Grace Espaldon' },
  { id: 'agent_charlotte', name: 'Charlotte Andrade' },
  { id: 'agent_joe', name: 'Joe Freeman' },
  { id: 'agent_samantha', name: 'Samantha Kerstetter' },
]

const OUTCOMES = ['no_answer', 'no_value', 'left_voicemail', 'connected']
const ACTIVITY_TYPES = ['call', 'email', 'note', 'task']

// Weighted distributions per agent (outcome weights: no_answer, no_value, left_voicemail, connected)
const AGENT_PROFILES = {
  agent_grace:    { outcomeWeights: [73, 1, 24, 3],  activityWeights: [31, 11, 12, 46], callsPerDay: 80 },
  agent_charlotte:{ outcomeWeights: [65, 5, 25, 5],  activityWeights: [35, 15, 10, 40], callsPerDay: 50 },
  agent_joe:      { outcomeWeights: [70, 3, 20, 7],  activityWeights: [40, 10, 8, 42],  callsPerDay: 25 },
  agent_samantha: { outcomeWeights: [68, 4, 22, 6],  activityWeights: [38, 12, 10, 40], callsPerDay: 18 },
}

function weightedRandom(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}

function generateCalls() {
  const calls = []
  let id = 1
  const now = new Date('2026-03-22T18:00:00Z')

  // Generate 7 days of data
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    const dayDate = new Date(now)
    dayDate.setDate(dayDate.getDate() - daysAgo)

    for (const agent of AGENTS) {
      const profile = AGENT_PROFILES[agent.id]
      // Vary volume slightly each day
      const count = Math.round(profile.callsPerDay * (0.8 + Math.random() * 0.4))

      for (let i = 0; i < count; i++) {
        const hour = 8 + Math.floor(Math.random() * 9) // 8am–5pm
        const minute = Math.floor(Math.random() * 60)
        const timestamp = new Date(dayDate)
        timestamp.setHours(hour, minute, 0, 0)

        const activityType = weightedRandom(ACTIVITY_TYPES, profile.activityWeights)
        const outcome = activityType === 'call'
          ? weightedRandom(OUTCOMES, profile.outcomeWeights)
          : null

        calls.push({
          id: `call_${id++}`,
          agentId: agent.id,
          agentName: agent.name,
          timestamp: timestamp.toISOString(),
          duration: activityType === 'call' ? 15 + Math.floor(Math.random() * 180) : null,
          outcome,
          activityType,
          contactName: `Contact ${id}`,
          contactPhone: `+1-555-${String(1000 + id).slice(-4)}`,
          audioUrl: null,      // TODO: wire up Synthflow (open design question)
          transcriptText: null, // TODO: wire up Synthflow (open design question)
        })
      }
    }
  }

  return calls
}

export const mockCalls = generateCalls()

// ─── Aggregation helpers ─────────────────────────────────────────────────────

export function filterByPeriod(calls, period) {
  const now = new Date('2026-03-22T23:59:59Z')
  const today = new Date('2026-03-22T00:00:00Z')

  if (period === 'today') {
    return calls.filter(c => new Date(c.timestamp) >= today)
  }
  if (period === '7days') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    return calls.filter(c => new Date(c.timestamp) >= start)
  }
  if (period === '30days') {
    const start = new Date(now)
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
    return calls.filter(c => new Date(c.timestamp) >= start)
  }
  return calls
}

export function aggregateCallOutcomes(calls) {
  const agentMap = {}

  for (const call of calls) {
    if (call.activityType !== 'call') continue
    if (!agentMap[call.agentId]) {
      agentMap[call.agentId] = {
        agentId: call.agentId,
        name: call.agentName,
        no_answer: 0,
        no_value: 0,
        left_voicemail: 0,
        connected: 0,
        total: 0,
      }
    }
    if (call.outcome) {
      agentMap[call.agentId][call.outcome]++
      agentMap[call.agentId].total++
    }
  }

  return Object.values(agentMap).sort((a, b) => b.total - a.total)
}

export function aggregateActivity(calls) {
  const agentMap = {}

  for (const call of calls) {
    if (!agentMap[call.agentId]) {
      agentMap[call.agentId] = {
        agentId: call.agentId,
        name: call.agentName,
        call: 0,
        email: 0,
        note: 0,
        task: 0,
        total: 0,
      }
    }
    agentMap[call.agentId][call.activityType]++
    agentMap[call.agentId].total++
  }

  return Object.values(agentMap).sort((a, b) => b.total - a.total)
}

export function getAgentCalls(calls, agentId) {
  return calls
    .filter(c => c.agentId === agentId && c.activityType === 'call')
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}
