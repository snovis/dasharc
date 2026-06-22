import { Router } from 'express';
import { requireAuth } from '../auth.js';

/* global Buffer, process */

const router = Router();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const DALLAS_FROM_NUMBER = process.env.DALLAS_TWILIO_FROM_NUMBER;

function basicAuthHeader() {
  const token = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

function toTwilioDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function normalizeTwilioCall(call) {
  return {
    call_id: call.sid,
    call_status: call.status,
    duration: Number(call.duration || 0),
    lead_phone_number: call.to,
    start_time: call.start_time,
    end_time: call.end_time,
    direction: call.direction,
    from: call.from,
  };
}

// GET /api/dallas-calls?accountId=<id>&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
// Only accounts with rvm_campaign enabled in accounts.yaml may access this data.
router.get('/', requireAuth, async (req, res) => {
  const { access } = req.auth;
  const { accountId, fromDate, toDate, pageToken } = req.query;

  if (!accountId) {
    return res.status(400).json({ error: 'accountId query param is required' });
  }

  const account = access.accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    return res.status(403).json({ error: `Account ${accountId} is not accessible to this user` });
  }
  if (!account.rvm_campaign) {
    return res.status(400).json({ error: `Account ${accountId} has no RVM campaign configured` });
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !DALLAS_FROM_NUMBER) {
    return res.status(500).json({ error: 'Twilio RVM credentials are not configured' });
  }

  const params = new URLSearchParams({
    From: DALLAS_FROM_NUMBER,
    PageSize: '100',
  });
  const startAfter = toTwilioDate(fromDate);
  const startBefore = toTwilioDate(toDate);
  if (startAfter) params.set('StartTime>=', startAfter);
  if (startBefore) params.set('StartTime<=', startBefore);
  if (pageToken) params.set('PageToken', String(pageToken));

  try {
    const upstream = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json?${params}`,
      { headers: { Authorization: basicAuthHeader() } },
    );
    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      console.error('Twilio calls error:', upstream.status, data);
      return res.status(502).json({ error: `Twilio returned HTTP ${upstream.status}` });
    }
    if (!data) {
      return res.status(502).json({ error: 'Twilio returned an invalid response' });
    }

    let nextPageToken = null;
    if (data.next_page_uri) {
      const nextUrl = new URL(data.next_page_uri, 'https://api.twilio.com');
      nextPageToken = nextUrl.searchParams.get('PageToken');
    }

    return res.json({
      calls: (data.calls ?? []).map(normalizeTwilioCall),
      nextPageToken,
    });
  } catch (err) {
    console.error('dallas-calls error:', err);
    return res.status(502).json({ error: `Failed to reach Twilio: ${err.message}` });
  }
});

export default router;
