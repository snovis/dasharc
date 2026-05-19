import { verifyRequest, handleAuthError } from './_lib/verify-token.js';

// Lightweight identity-confirmation endpoint. The client hits this right after
// receiving an ID token (Google or Microsoft) and only completes sign-in if
// this returns 200. Prevents unauthorized users from briefly seeing the
// dashboard chrome between sign-in and the first /api/agents 403.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const user = await verifyRequest(req);
    return res.status(200).json({ user });
  } catch (err) {
    return handleAuthError(err, res);
  }
}
