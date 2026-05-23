import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

const SENSITIVE_CALL_FIELDS = ['telephony_sip_headers'];

function sanitize(call) {
  const clean = { ...call };
  for (const k of SENSITIVE_CALL_FIELDS) delete clean[k];
  return clean;
}

// GET /api/call?id=<callId>
router.get('/', requireAuth, async (req, res) => {
  if (!process.env.SYNTHFLOW_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SYNTHFLOW_API_KEY not set' });
  }

  const { access } = req.auth;
  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id query param is required' });
  }

  try {
    const upstream = await fetch(
      `https://api.synthflow.ai/v2/calls/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}` } },
    );

    const body = await upstream.text();
    let data;
    try { data = JSON.parse(body); } catch {
      return res.status(502).json({ error: 'Upstream returned non-JSON', body: body.slice(0, 300) });
    }

    if (upstream.status === 404) {
      return res.status(404).json({ error: 'Call not found' });
    }
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream Synthflow error',
        upstream_status: upstream.status,
        detail: data.detail ?? data,
      });
    }

    const call = data?.response?.calls?.[0];
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // 404 (not 403) when the call's agent isn't in the user's allowed set —
    // don't leak existence of calls outside their tenant.
    if (!access.agentIds.has(call.model_id)) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json({ call: sanitize(call) });
  } catch (err) {
    console.error('call handler error:', err);
    res.status(502).json({ error: `Failed to reach Synthflow: ${err.message}` });
  }
});

export default router;
