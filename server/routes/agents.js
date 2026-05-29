import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

const SENSITIVE_TOP_FIELDS = [
  'external_webhook_url',
  'inbound_call_webhook_url',
  'consent_text',
];

function sanitize(assistant) {
  const clean = { ...assistant };
  for (const key of SENSITIVE_TOP_FIELDS) delete clean[key];
  if (clean.agent && typeof clean.agent === 'object') {
    const { prompt, ...rest } = clean.agent;
    clean.agent = rest;
  }
  return clean;
}

// GET /api/agents[?accountId=...]
// Returns Synthflow assistant metadata for the agents this user can see.
// If accountId is provided, narrows to just that account's agents.
router.get('/', requireAuth, async (req, res) => {
  if (!process.env.SYNTHFLOW_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SYNTHFLOW_API_KEY not set' });
  }

  const { access } = req.auth;
  const { accountId } = req.query;

  let allowedAgentIds = access.agentIds;
  if (accountId) {
    const acct = access.accounts.find((a) => a.id === accountId);
    if (!acct) {
      return res.status(403).json({ error: `Account ${accountId} is not accessible to this user` });
    }
    allowedAgentIds = new Set(acct.agents.map((a) => a.id));
  }

  if (allowedAgentIds.size === 0) {
    return res.json({ agents: [] });
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
      .filter((a) => allowedAgentIds.has(a.model_id))
      .map((a) => {
        const clean = sanitize(a);
        // Tag with the account it belongs to so the frontend can group.
        clean.account_id = access.accountByAgentId.get(a.model_id) ?? null;
        return clean;
      });

    res.json({ agents: filtered });
  } catch (err) {
    console.error('agents handler error:', err);
    res.status(502).json({ error: `Failed to reach Synthflow: ${err.message}` });
  }
});

export default router;
