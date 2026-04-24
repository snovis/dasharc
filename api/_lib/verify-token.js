import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose';

const GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
const MICROSOFT_CLIENT_ID = process.env.VITE_MICROSOFT_CLIENT_ID;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
// Multi-tenant Microsoft v2 tokens have iss = https://login.microsoftonline.com/<tenantGuid>/v2.0
const MICROSOFT_ISSUER_PATTERN = /^https:\/\/login\.microsoftonline\.com\/[0-9a-f-]+\/v2\.0$/;

const googleJwks = GOOGLE_CLIENT_ID
  ? createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  : null;
const microsoftJwks = MICROSOFT_CLIENT_ID
  ? createRemoteJWKSet(new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'))
  : null;

export class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

export async function verifyRequest(req) {
  if (!GOOGLE_CLIENT_ID && !MICROSOFT_CLIENT_ID) {
    throw new AuthError(
      'Server misconfigured: at least one of VITE_GOOGLE_CLIENT_ID or VITE_MICROSOFT_CLIENT_ID must be set',
      500,
    );
  }
  if (ALLOWED_EMAILS.length === 0) {
    throw new AuthError('Server misconfigured: ALLOWED_EMAILS not set', 500);
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or malformed Authorization header', 401);
  }

  const idToken = authHeader.slice(7).trim();

  let unverified;
  try {
    unverified = decodeJwt(idToken);
  } catch (err) {
    throw new AuthError(`Malformed ID token: ${err.message}`, 401);
  }

  const iss = unverified.iss;
  let payload;
  let provider;

  if (googleJwks && GOOGLE_ISSUERS.includes(iss)) {
    provider = 'google';
    try {
      ({ payload } = await jwtVerify(idToken, googleJwks, {
        audience: GOOGLE_CLIENT_ID,
        issuer: GOOGLE_ISSUERS,
      }));
    } catch (err) {
      throw new AuthError(`Invalid Google ID token: ${err.message}`, 401);
    }
    if (!payload.email_verified) {
      throw new AuthError('Email not verified by Google', 403);
    }
  } else if (microsoftJwks && MICROSOFT_ISSUER_PATTERN.test(iss)) {
    provider = 'microsoft';
    try {
      ({ payload } = await jwtVerify(idToken, microsoftJwks, {
        audience: MICROSOFT_CLIENT_ID,
        // Per-tenant issuer; the pattern check above bounds it to the Microsoft v2 endpoint.
        issuer: iss,
      }));
    } catch (err) {
      throw new AuthError(`Invalid Microsoft ID token: ${err.message}`, 401);
    }
  } else {
    throw new AuthError(`Unrecognized or disabled token issuer: ${iss}`, 401);
  }

  // Microsoft tokens may not include `email` (depends on tenant config); fall back to `preferred_username`.
  const emailRaw = payload.email || payload.preferred_username;
  if (!emailRaw) {
    throw new AuthError('Token payload missing email', 401);
  }

  const email = String(emailRaw).toLowerCase();
  if (!ALLOWED_EMAILS.includes(email)) {
    throw new AuthError(`Email ${email} is not authorized for this deployment`, 403);
  }

  return {
    email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
    provider,
  };
}

export function handleAuthError(err, res) {
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('Unexpected error in auth flow:', err);
  return res.status(500).json({ error: 'Internal server error' });
}
