import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

const N8N_DALLAS_STATS_URL =
  process.env.N8N_DALLAS_STATS_URL ||
  'https://salesarcsolutions.app.n8n.cloud/webhook/onsite-dallas-stats';

// GET /api/dallas-stats?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get('/', requireAuth, async (req, res) => {
  const { fromDate, toDate } = req.query;

  if (!fromDate || !toDate) {
    return res.status(400).json({ error: 'fromDate and toDate query params are required' });
  }

  try {
    const url = new URL(N8N_DALLAS_STATS_URL);
    url.searchParams.set('fromDate', fromDate);
    url.searchParams.set('toDate', toDate);

    const upstream = await fetch(url.toString());

    if (!upstream.ok) {
      return res.status(502).json({ error: `n8n returned HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.error('dallas-stats error:', err);
    return res.status(502).json({ error: `Failed to reach n8n: ${err.message}` });
  }
});

export default router;