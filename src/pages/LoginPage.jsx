import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import appConfig from '../config/app'

export default function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const buttonRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user) {
      const redirectTo = location.state?.from?.pathname || '/'
      navigate(redirectTo, { replace: true })
    }
  }, [user, navigate, location])

  useEffect(() => {
    if (!appConfig.googleClientId) {
      setError('This deployment is not configured: VITE_GOOGLE_CLIENT_ID is missing.')
      return
    }

    let cancelled = false
    let attempts = 0

    function tryRender() {
      if (cancelled) return
      if (!window.google?.accounts?.id) {
        if (attempts++ > 50) {
          setError('Google Sign-In failed to load. Check your connection and reload.')
          return
        }
        setTimeout(tryRender, 100)
        return
      }
      window.google.accounts.id.initialize({
        client_id: appConfig.googleClientId,
        callback: (response) => {
          try {
            signIn(response.credential)
          } catch (err) {
            setError(`Sign-in failed: ${err.message}`)
          }
        },
      })
      if (buttonRef.current) {
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_blue',
          size: 'large',
          shape: 'rectangular',
          text: 'signin_with',
          width: 280,
        })
      }
    }

    tryRender()
    return () => { cancelled = true }
  }, [signIn])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">{appConfig.appName}</h1>
          <p className="text-slate-400 text-sm mt-1">{appConfig.companyName} — Call Dashboard</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center gap-4">
          <p className="text-slate-300 text-sm text-center">
            Sign in with your authorized Google account.
          </p>
          <div ref={buttonRef} />
          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}
          <p className="text-slate-500 text-xs text-center">
            Only emails in this deployment's allowlist can access the dashboard.
          </p>
        </div>
      </div>
    </div>
  )
}
