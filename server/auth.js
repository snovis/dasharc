// Thin wrapper around verifyRequest that also resolves the user's per-tenant
// access from the YAML config. Used as Express middleware.

import { verifyRequest, AuthError } from '../api/_lib/verify-token.js';
import { resolveUserAccess } from './config.js';
import { getSessionToken, verifySession } from './session.js';

export { AuthError };

/**
 * Express middleware. On success attaches:
 *   req.auth = { user, access }
 * On failure: returns the appropriate 4xx/5xx JSON error.
 *
 * Auth precedence:
 *   1. Session cookie (our own JWT) — the normal path once signed in. No
 *      provider round-trip; lifetime is controlled by the cookie's exp.
 *   2. Provider ID token (Authorization: Bearer) — used by POST /api/session
 *      to bootstrap the cookie, and as a safety net during rollout.
 *
 * In both cases the YAML `users` list is the authoritative allowlist: an
 * unknown email gets a 403.
 */
export async function requireAuth(req, res, next) {
  let user = null;

  const sessionToken = getSessionToken(req);
  if (sessionToken) {
    try {
      user = await verifySession(sessionToken);
    } catch {
      user = null; // expired/tampered cookie → try the Bearer path below
    }
  }

  if (!user) {
    try {
      user = await verifyRequest(req);
    } catch (err) {
      if (err instanceof AuthError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error('Unexpected auth error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  const access = resolveUserAccess(user.email);
  if (!access) {
    return res.status(403).json({
      error: `Email ${user.email} is not authorized in the dashboard config`,
    });
  }

  req.auth = { user, access };
  next();
}
