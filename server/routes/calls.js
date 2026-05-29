import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

const SENSITIVE_CALL_FIELDS = ['telephony_sip_headers'];

function sanitize(call) {
  const clean = { ...call };
  for (const k of SENSITIVE_CALL_FIELDS) delete clean[k];
  return clean;
}

// Synthflow's `to_date` is exclusive. Treat YYYY-MM-DD inclusively by bumping one day.
function makeInclusiveEndDate(toDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(toDate)) return toDate;
  const d = new Date(toDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// GET /api/calls?agentId=&fromDate=&toDate=&limit=&offset=
router.get('/', requireAuth, async (req, res) => {
  if (!process.env.SYNTHFLOW_API_KEY) {
    return res.status(500).json({ error: 'Server misconfigured: SYNTHFLOW_API_KEY not set' });
  }

  const { access } = req.auth;
  const { agentId, fromDate, toDate, limit, offset } = req.query;

  if (!agentId) {
    return res.status(400).json({ error: 'agentId query param is required' });
  }
  if (!access.agentIds.has(agentId)) {
    return res.status(403).json({ error: `agentId ${agentId} is not authorized for this user` });
  }

  const params = new URLSearchParams();
  params.set('model_id', agentId);
  if (fromDate) params.set('from_date', fromDate);
  if (toDate) params.set('to_date', makeInclusiveEndDate(toDate));

  const clampedLimit = Math.min(Math.max(Number(limit) || 100, 1), 100);
  params.set('limit', String(clampedLimit));
  if (offset) params.set('offset', String(Math.max(Number(offset) || 0, 0)));

  try {
    const upstream = await fetch(`https://api.synthflow.ai/v2/calls?${params.toString()}`, {
      headers: { Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}` },
    });

    const body = await upstream.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return res.status(502).json({ error: 'Upstream returned non-JSON', body: body.slice(0, 300) });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream Synthflow error',
        upstream_status: upstream.status,
        detail: data.detail ?? data,
      });
    }

    const resp = data.response ?? {};
    const calls = (resp.calls ?? []).map(sanitize);
    const pagination = resp.pagination ?? null;

    res.json({ calls, pagination });
  } catch (err) {
    console.error('calls handler error:', err);
    res.status(502).json({ error: `Failed to reach Synthflow: ${err.message}` });
  }
});

export default router;
