import { createContext, useContext, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const AuthContext = createContext(null)
const STORAGE_KEY = 'dasharc.auth'

function decodeJWT(token) {
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

// Normalize across providers. Google tokens carry `email` + `picture`;
// Microsoft tokens may put the address in `preferred_username` and rarely include `picture`.
function userFromPayload(payload) {
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

function readStoredSession() {
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

function writeStoredSession(idToken, expiresAt) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ idToken, expiresAt }))
  } catch {
    // sessionStorage disabled / quota exceeded — non-fatal
  }
}

function clearStoredSession() {
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState(() => {
    const stored = readStoredSession()
    return stored ?? { idToken: null, user: null }
  })

  const signIn = useCallback((token) => {
    const payload = decodeJWT(token)
    const user = userFromPayload(payload)
    if (!user) throw new Error('Invalid ID token')
    const expiresAt = (payload.exp || 0) * 1000
    writeStoredSession(token, expiresAt)
    // New user session — drop any cached data tied to the previous signed-in user.
    queryClient.clear()
    setState({ idToken: token, user })
  }, [queryClient])

  const signOut = useCallback(() => {
    clearStoredSession()
    queryClient.clear()
    setState({ idToken: null, user: null })
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  }, [queryClient])

  const value = {
    user: state.user,
    idToken: state.idToken,
    loading: false,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
