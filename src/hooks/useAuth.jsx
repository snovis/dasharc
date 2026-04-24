import { createContext, useContext, useState, useCallback } from 'react'
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

  const signIn = useCallback((token) => {
    const session = writeAuthSession(token)
    if (!session) throw new Error('Invalid ID token')
    // New user session — drop any cached data tied to the previous signed-in user.
    queryClient.clear()
    setState(session)
  }, [queryClient])

  const signOut = useCallback(() => {
    clearAuthSession()
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
