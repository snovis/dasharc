const STORAGE_KEY = 'dasharc.auth'

export function decodeJWT(token) {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4
    const padded = pad ? base64 + '='.repeat(4 - pad) : base64
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

// Microsoft tokens may put the address in `preferred_username` and rarely include `picture`.
export function userFromPayload(payload) {
  if (!payload) return null
  const email = payload.email || payload.preferred_username
  if (!email) return null
  return {
    email,
    name: payload.name,
    picture: payload.picture,
    sub: payload.sub,
  }
}

export function readAuthSession() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const { idToken, expiresAt } = JSON.parse(raw)
    if (!idToken || !expiresAt || Date.now() >= expiresAt) return null
    const user = userFromPayload(decodeJWT(idToken))
    if (!user) return null
    return { idToken, user }
  } catch {
    return null
  }
}

export function writeAuthSession(idToken) {
  if (!idToken) return null
  const payload = decodeJWT(idToken)
  const user = userFromPayload(payload)
  if (!user) return null
  const expiresAt = (payload.exp || 0) * 1000
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ idToken, expiresAt }))
    return { idToken, user }
  } catch {
    return null
  }
}

export function clearAuthSession() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}
