import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  readAuthSession,
  writeAuthSession,
  clearAuthSession,
} from '../lib/auth-storage'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState(() => {
    const stored = readAuthSession()
    return stored ?? { idToken: null, user: null }
  })
  const [signOutReason, setSignOutReason] = useState(null)

  const signIn = useCallback((token) => {
    const session = writeAuthSession(token)
    if (!session) throw new Error('Invalid ID token')
    // New user session — drop any cached data tied to the previous signed-in user.
    queryClient.clear()
    setSignOutReason(null)
    setState(session)
  }, [queryClient])

  const signOut = useCallback((reason = null) => {
    clearAuthSession()
    queryClient.clear()
    setSignOutReason(reason)
    setState({ idToken: null, user: null })
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect()
    }
  }, [queryClient])

  // Centralized auth-error handling: any query that fails with 401/403 means
  // the server rejected the caller's identity (expired token or not on the
  // allowlist). Bounce them back to /login with a clear reason rather than
  // stranding them on the dashboard with a generic "failed to load" error.
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
    user: state.user,
    idToken: state.idToken,
    loading: false,
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
