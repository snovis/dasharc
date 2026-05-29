// Client-side auth persistence. The real session lives in an httpOnly cookie
// the server sets (see server/session.js) — the browser can't read it, so we
// keep only a lightweight copy of the signed-in user here for instant paint on
// reload. On mount, AuthProvider revalidates against /api/me; if the cookie is
// gone the stored user is cleared. localStorage (not sessionStorage) so the
// session survives tab-close, new tabs, and browser restarts.

const USER_KEY = 'dasharc.user';

export function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user?.email ? user : null;
  } catch {
    return null;
  }
}

export function writeStoredUser(user) {
  try {
    if (user?.email) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
  return user;
}

export function clearStoredUser() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}
