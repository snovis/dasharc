import { verifyRequest, handleAuthError } from './_lib/verify-token.js';

// The Dallas RVM campaign dials out through Twilio directly (ringless voicemail),
// bypassing Synthflow entirely. This endpoint pulls call history straight from
// Twilio's Call Logs API for the campaign's outbound number, so the dashboard can
// show RVM activity that Synthflow has no record of.
const DALLAS_FROM_NUMBER = process.env.DALLAS_TWILIO_FROM_NUMBER || '+17655713129';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function basicAuthHeader() {
  const token = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  return `Basic ${token}`;
}

// Twilio's StartTime filters are inclusive on both ends when using <= / >= suffixes.
function toTwilioDate(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  return dateStr.slice(0, 10);
}

// Normalize a Twilio call record into the shape the dashboard's call table expects
// (mirrors the fields AgentDetailPage.jsx reads off Synthflow calls, where applicable).
function normalizeTwilioCall(call) {
  return {
    call_id: call.sid,
    call_status: call.status,
    duration: Number(call.duration || 0),
    lead_phone_number: call.to,
    lead_name: null,
    start_time: call.start_time,
    end_time: call.end_time,
    recording_url: null,
    transcript: null,
    direction: call.direction,
    from: call.from,
  };
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

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return res
      .status(500)
      .json({ error: 'Server misconfigured: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set' });
  }

  const { fromDate, toDate, limit, pageToken } = req.query ?? {};

  const params = new URLSearchParams();
  params.set('From', DALLAS_FROM_NUMBER);

  const startAfter = toTwilioDate(fromDate);
  const startBefore = toTwilioDate(toDate);
  if (startAfter) params.set('StartTime>=', startAfter);
  if (startBefore) params.set('StartTime<=', startBefore);

  const clampedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  params.set('PageSize', String(clampedLimit));
  if (pageToken) params.set('PageToken', String(pageToken));

  try {
    const upstream = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json?${params.toString()}`,
      { headers: { Authorization: basicAuthHeader() } },
    );

    const body = await upstream.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return res.status(502).json({ error: 'Upstream returned non-JSON', body: body.slice(0, 300) });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: 'Upstream Twilio error',
        upstream_status: upstream.status,
        detail: data,
      });
    }

    const calls = (data.calls ?? []).map(normalizeTwilioCall);
    const nextPageUri = data.next_page_uri ?? null;

    return res.status(200).json({ calls, nextPageUri });
  } catch (err) {
    console.error('dallas-calls handler error:', err);
    return res.status(502).json({ error: `Failed to reach Twilio: ${err.message}` });
  }
}