import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { PublicClientApplication } from '@azure/msal-browser'
import { useAuth } from '../hooks/useAuth'
import appConfig from '../config/app'

// MSAL singleton — only instantiated if Microsoft is configured for this deployment.
const msalInstance = appConfig.microsoftClientId
  ? new PublicClientApplication({
      auth: {
        clientId: appConfig.microsoftClientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
      },
      cache: { cacheLocation: 'sessionStorage' },
    })
  : null

let msalReady = null
function ensureMsalReady() {
  if (!msalInstance) return Promise.resolve(false)
  if (!msalReady) msalReady = msalInstance.initialize().then(() => true)
  return msalReady
}

export default function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const buttonRef = useRef(null)
  const [error, setError] = useState('')
  const [msSigningIn, setMsSigningIn] = useState(false)

  useEffect(() => {
    if (user) {
      const redirectTo = location.state?.from?.pathname || '/'
      navigate(redirectTo, { replace: true })
    }
  }, [user, navigate, location])

  useEffect(() => {
    if (!appConfig.googleClientId) return

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

  async function handleMicrosoftSignIn() {
    setError('')
    setMsSigningIn(true)
    const popupOpts = {
      scopes: ['openid', 'profile', 'email'],
      prompt: 'select_account',
    }
    try {
      await ensureMsalReady()
      let result
      try {
        result = await msalInstance.loginPopup(popupOpts)
      } catch (err) {
        // Stale interaction state from a prior interrupted attempt blocks new logins.
        // Clear and retry once.
        if (err?.errorCode === 'interaction_in_progress') {
          await msalInstance.clearCache()
          result = await msalInstance.loginPopup(popupOpts)
        } else {
          throw err
        }
      }
      if (!result?.idToken) throw new Error('No ID token returned from Microsoft')
      signIn(result.idToken)
    } catch (err) {
      setError(`Microsoft sign-in failed: ${err.message || err}`)
    } finally {
      setMsSigningIn(false)
    }
  }

  const noProvidersConfigured = !appConfig.googleClientId && !appConfig.microsoftClientId

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">{appConfig.appName}</h1>
          <p className="text-slate-400 text-sm mt-1">{appConfig.companyName} — Call Dashboard</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-8 shadow-xl flex flex-col items-center gap-4">
          {noProvidersConfigured ? (
            <p className="text-red-400 text-xs text-center">
              This deployment is not configured: at least one of VITE_GOOGLE_CLIENT_ID or VITE_MICROSOFT_CLIENT_ID is required.
            </p>
          ) : (
            <p className="text-slate-300 text-sm text-center">
              Sign in with your authorized account.
            </p>
          )}

          {appConfig.googleClientId && <div ref={buttonRef} />}

          {appConfig.microsoftClientId && (
            <button
              type="button"
              onClick={handleMicrosoftSignIn}
              disabled={msSigningIn}
              className="w-[280px] h-[44px] flex items-center justify-center gap-3 bg-[#2F2F2F] hover:bg-[#1a1a1a] disabled:opacity-50 text-white font-medium rounded transition-colors"
              style={{ fontFamily: 'Segoe UI, system-ui, sans-serif' }}
            >
              <MicrosoftLogo />
              <span>{msSigningIn ? 'Signing in…' : 'Sign in with Microsoft'}</span>
            </button>
          )}

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

function MicrosoftLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
