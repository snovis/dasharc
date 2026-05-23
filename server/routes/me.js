import { Router } from 'express';
import { requireAuth } from '../auth.js';

const router = Router();

// GET /api/me — returns user identity + the accounts/agents/branding they can see.
// The frontend uses this to render the selector and pick branding.
router.get('/', requireAuth, (req, res) => {
  const { user, access } = req.auth;
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

export default router;
