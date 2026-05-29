// Server-issued session: after a provider (Google/Microsoft) ID token is
// verified once, we mint our own HS256 JWT and set it as an httpOnly cookie.
// Subsequent requests authenticate via the cookie — no provider round-trip,
// and the lifetime is ours to control (default 30 days) instead of the
// provider token's ~1 hour.

import { SignJWT, jwtVerify } from 'jose';

export const COOKIE_NAME = 'dasharc_session';

const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS) || 30;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;

let secretKey = null;

function getSecret() {
  if (secretKey) return secretKey;
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters');
  }
  secretKey = new TextEncoder().encode(raw);
  return secretKey;
}

export function sessionConfigured() {
  const raw = process.env.SESSION_SECRET;
  return !!raw && raw.length >= 32;
}

export async function signSession(user) {
  return new SignJWT({
    email: user.email,
    name: user.name ?? null,
    picture: user.picture ?? null,
    provider: user.provider ?? null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setSubject(user.email)
    .setExpirationTime(`${TTL_DAYS}d`)
    .sign(getSecret());
}

export async function verifySession(token) {
  const { payload } = await jwtVerify(token, getSecret());
  const email = payload.email || payload.sub;
  if (!email) throw new Error('Session token missing email');
  return {
    email: String(email),
    name: payload.name ?? null,
    picture: payload.picture ?? null,
    provider: payload.provider ?? null,
  };
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k) out[k] = part.slice(idx + 1).trim();
  }
  return out;
}

export function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || null;
}

// The site is HTTPS-only in production (nginx terminates TLS and forwards
// X-Forwarded-Proto), so mark the cookie Secure there; skip it on plain-http
// localhost dev or the browser would refuse to store it.
function isSecure(req) {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function setSessionCookie(res, req, token) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${TTL_SECONDS}`,
  ];
  if (isSecure(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res, req) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}
