import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const client = new OAuth2Client(CLIENT_ID);

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export async function verifyRequest(req) {
  if (!CLIENT_ID) {
    throw new AuthError('Server misconfigured: VITE_GOOGLE_CLIENT_ID not set', 500);
  }
  if (ALLOWED_EMAILS.length === 0) {
    throw new AuthError('Server misconfigured: ALLOWED_EMAILS not set', 500);
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header', 401);
  }

  const idToken = authHeader.slice(7).trim();

  let ticket;
  try {
    ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
  } catch (err) {
    throw new AuthError(`Invalid ID token: ${err.message}`, 401);
  }

  const payload = ticket.getPayload();
  if (!payload?.email) {
    throw new AuthError('Token payload missing email', 401);
  }
  if (!payload.email_verified) {
    throw new AuthError('Email not verified by Google', 403);
  }

  const email = payload.email.toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) {
    throw new AuthError(`Email ${email} is not authorized for this deployment`, 403);
  }

  return {
    email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
  };
}

export function handleAuthError(err, res) {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Unexpected error in auth flow:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
