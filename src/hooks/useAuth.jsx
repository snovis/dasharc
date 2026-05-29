import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { readStoredUser, writeStoredUser, clearStoredUser } from '../lib/auth-storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState(() => readStoredUser())
  // With a stored user we can render immediately and revalidate in the
  // background; with none, wait for the /api/me check before routing.
  const [loading, setLoading] = useState(() => !readStoredUser())
  // On first paint, pick up any sign-in error stashed by the Microsoft
  // redirect flow in main.jsx — it can't show its own UI, so it leaves a
  // message here for the login page to display.
  const [signOutReason, setSignOutReason] = useState(() => {
    try {
      const err = sessionStorage.getItem('dasharc.signInError')
      if (err) sessionStorage.removeItem('dasharc.signInError')
      return err
    } catch {
      return null
    }
  })

  const signOut = useCallback((reason = null) => {
    // Clear the server cookie; fire-and-forget — local state is cleared regardless.
    fetch('/api/logout', { method: 'POST', credentials: 'include' }).catch(() => {})
    clearStoredUser()
    queryClient.clear()
    setSignOutReason(reason)
    setUser(null)
    setLoading(false)
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  }, [queryClient])

  // On mount, confirm the session cookie with the server. Restores a session
  // when localStorage was cleared but the cookie is still alive, and clears a
  // stale stored user when the cookie has expired. Network errors leave the
  // optimistic state untouched (don't sign someone out over a blip).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const body = await res.json()
          writeStoredUser(body.user)
          setUser(body.user)
        } else if (res.status === 401 || res.status === 403) {
          clearStoredUser()
          setUser(null)
        }
      } catch {
        /* network error — keep whatever optimistic state we had */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (idToken) => {
    // Exchange the provider ID token for our httpOnly session cookie. The
    // server verifies the token + allowlist and returns the /api/me payload.
    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${idToken}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Sign-in rejected (HTTP ${res.status})`)
    }
    const body = await res.json()
    writeStoredUser(body.user)
    // New user session — drop any cached data tied to the previous signed-in user.
    queryClient.clear()
    setSignOutReason(null)
    setUser(body.user)
    setLoading(false)
  }, [queryClient])

  // Centralized auth-error handling: any query that fails with 401/403 means
  // the server rejected the caller (expired/invalid cookie or not on the
  // allowlist). Bounce them back to /login with a clear reason.
  useEffect(() => {
    const cache = queryClient.getQueryCache()
    return cache.subscribe((event) => {
      if (event?.type !== 'updated') return
      if (event.query.state.status !== 'error') return
      const status = event.query.state.error?.status
      if (status === 401) {
        signOut('Your session expired. Please sign in again.')
      } else if (status === 403) {
        signOut('Your account is not authorized for this dashboard.')
      }
    })
  }, [queryClient, signOut])

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    signOutReason,
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
