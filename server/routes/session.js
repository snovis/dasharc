import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { signSession, setSessionCookie, clearSessionCookie } from '../session.js';

const router = Router();

// POST /api/session — exchange a verified provider ID token (sent as
// `Authorization: Bearer <id_token>`) for a long-lived httpOnly session
// cookie. requireAuth verifies the token and resolves access; if the caller
// already has a valid session cookie it's accepted too (re-issues a fresh one).
// Returns the same shape as GET /api/me so the client can hydrate in one call.
router.post('/session', requireAuth, async (req, res) => {
  const { user, access } = req.auth;
  const token = await signSession(user);
  setSessionCookie(res, req, token);
  res.json({
    user: {
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
    },
    role: access.role,
    is_support: access.isWildcard || access.role === 'support',
    accounts: access.accounts,
  });
});

// POST /api/logout — clear the session cookie. No auth required: logging out
// an already-invalid session should still succeed.
router.post('/logout', (req, res) => {
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

export default router;
