import { Navigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import Spinner from '../ui/Spinner'

// When MSAL's popup lands back on our SPA root with ?code=... in the URL,
// the parent window is polling for that exact URL. If we redirect (Navigate
// to /login), the query string is stripped and the parent loses the code —
// the popup never closes. Render null instead and let the URL stay intact.
function isOAuthCallbackUrl() {
  if (typeof window === 'undefined') return false
  const { search, hash } = window.location
  return (
    search.includes('code=') ||
    search.includes('error=') ||
    hash.includes('access_token=') ||
    hash.includes('id_token=')
  )
}

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    if (isOAuthCallbackUrl()) return null
    return <Navigate to="/login" replace />
  }

  return children
}
