// Thin wrapper around verifyRequest that also resolves the user's per-tenant
// access from the YAML config. Used as Express middleware.

import { verifyRequest, AuthError } from '../api/_lib/verify-token.js';
import { resolveUserAccess } from './config.js';

export { AuthError };

/**
 * Express middleware. On success attaches:
 *   req.auth = { user, access }
 * On failure: returns the appropriate 4xx/5xx JSON error.
 *
 * Note: ALLOWED_EMAILS in env still acts as a coarse gate inside verifyRequest;
 * the YAML config's user list is the finer-grained authorization. Keep both
 * synced (or remove ALLOWED_EMAILS once the YAML is the single source of truth).
 */
export async function requireAuth(req, res, next) {
  let user;
  try {
    user = await verifyRequest(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Unexpected auth error:', err);
    return res.status(500).json({ error: 'Internal server error' });
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
