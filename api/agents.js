import { verifyRequest, handleAuthError } from './_lib/verify-token.js';

const AGENT_IDS = (process.env.AGENT_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const SENSITIVE_TOP_FIELDS = [
  'external_webhook_url',
  'inbound_call_webhook_url',
  'consent_text',
];

function sanitize(assistant) {
  const clean = { ...assistant };
  for (const key of SENSITIVE_TOP_FIELDS) delete clean[key];
  if (clean.agent && typeof clean.agent === 'object') {
    const { prompt, ...restAgent } = clean.agent;
    clean.agent = restAgent;
  }
  return clean;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await verifyRequest(req);
  } catch (err) {
    return handleAuthError(err, res);
  }

  if (!process.env.SYNTHFLOW_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SYNTHFLOW_API_KEY not set' });
  }
  if (AGENT_IDS.length === 0) {
    return res.status(500).json({ error: 'Server misconfigured: AGENT_IDS not set' });
  }

  try {
    const upstream = await fetch('https://api.synthflow.ai/v2/assistants?limit=100', {
      headers: { Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}` },
    });

    if (!upstream.ok) {
      const body = await upstream.text();
      return res.status(upstream.status).json({
        error: 'Upstream Synthflow error',
        upstream_status: upstream.status,
        upstream_body: body.slice(0, 500),
      });
    }

    const data = await upstream.json();
    const all = data?.response?.assistants ?? [];
    const filtered = all
      .filter((a) => AGENT_IDS.includes(a.model_id))
      .map(sanitize);

    return res.status(200).json({ agents: filtered });
  } catch (err) {
    console.error('agents handler error:', err);
    return res.status(502).json({ error: `Failed to reach Synthflow: ${err.message}` });
  }
}
