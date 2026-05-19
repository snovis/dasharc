import { verifyRequest, handleAuthError } from './_lib/verify-token.js';

const N8N_WEBHOOK_URL = process.env.N8N_DEMO_TRIGGER_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await verifyRequest(req);
  } catch (err) {
    return handleAuthError(err, res);
  }

  const { phone, first_name } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'phone is required' });
  }

  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_DEMO_TRIGGER_URL not configured' });
  }

  const response = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, first_name: first_name || '' }),
  });

  const data = await response.json().catch(() => ({}));
  return res.status(response.status).json(data);
}