import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

// POST /api/demo-trigger?accountId=<id>
// Body: { phone, first_name }
// Forwards to the n8n webhook configured on that account in accounts.yaml.
router.post('/', requireAuth, async (req, res) => {
  const { access } = req.auth;
  const { accountId } = req.query;
  const { phone, first_name } = req.body ?? {};

  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }
  if (!accountId) {
    return res.status(400).json({ error: 'accountId query param is required' });
  }

  const account = access.accounts.find((a) => a.id === accountId);
  if (!account) {
    return res.status(403).json({ error: `Account ${accountId} is not accessible to this user` });
  }
  if (!account.demo_trigger_url) {
    return res.status(400).json({ error: `Account ${accountId} has no demo_trigger_url configured` });
  }

  try {
    const upstream = await fetch(account.demo_trigger_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, first_name: first_name || '' }),
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('demo-trigger error:', err);
    res.status(502).json({ error: `Failed to reach n8n: ${err.message}` });
  }
});

export default router;
