import { useState, useEffect } from 'react'
import { onAuthChange } from '../firebase/auth'
import appConfig from '../config/app'

export function useAuth() {
  // In mock mode, simulate a logged-in user so we can build without Firebase credentials
  const [user, setUser] = useState(appConfig.useMockData ? { email: 'dev@mock.local', uid: 'mock' } : null)
  const [loading, setLoading] = useState(!appConfig.useMockData)

  useEffect(() => {
    if (appConfig.useMockData) return

    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { user, loading }
}
