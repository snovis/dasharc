import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

const SENSITIVE_CALL_FIELDS = ['telephony_sip_headers'];

function sanitize(call) {
  const clean = { ...call };
  for (const k of SENSITIVE_CALL_FIELDS) delete clean[k];
  return clean;
}

// The single-call endpoint (v2/calls/{id}) returns a sparser shape than the
// list endpoint (v2/calls): no lead_name / lead_phone_number / call_status.
// Backfill those from the fields it does provide so the detail page renders
// the same data as the call log instead of blanks + an "Other" pill.
function normalizeCall(call) {
  const c = { ...call };
  if (c.call_status == null && c.status != null) c.call_status = c.status;
  if (!c.lead_name && c.name) c.lead_name = c.name;
  if (!c.lead_phone_number) {
    c.lead_phone_number =
      c.type_of_call === 'inbound' ? c.phone_number_from : c.phone_number_to;
  }
  return c;
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

    res.json({ call: sanitize(normalizeCall(call)) });
  } catch (err) {
    console.error('call handler error:', err);
    res.status(502).json({ error: `Failed to reach Synthflow: ${err.message}` });
  }
});

export default router;
