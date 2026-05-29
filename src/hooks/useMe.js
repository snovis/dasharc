import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'

// Fetches the user's tenancy data: which accounts they can see, what agents
// belong to each, branding, support flag, etc. Source of truth for the
// account/agent selector and per-account UI customization.
//
// staleTime is Infinity because the config only changes when the server is
// restarted — pointless to re-poll during a session. signOut clears the query
// cache, so the next signed-in user gets a fresh /api/me.
export function useMe() {
  const { isAuthenticated } = useAuth()
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/me', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = new Error(body.error || `HTTP ${res.status}`)
        err.status = res.status
        throw err
      }
      return body
    },
    enabled: isAuthenticated,
    staleTime: Infinity,
  })
}
