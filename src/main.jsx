import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureMsalReady } from './lib/msal'
import { writeStoredUser } from './lib/auth-storage'

// If we're returning from a Microsoft loginRedirect, MSAL processes the URL
// here and gives us the ID token. Exchange it for a session cookie via
// /api/session — symmetric with the Google sign-in flow in useAuth.signIn —
// which also verifies the allowlist, so unauthorized users never get a session.
const result = await ensureMsalReady()
if (result?.idToken) {
  try {
    const res = await fetch('/api/session', {
      method: 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${result.idToken}` },
    })
    if (res.ok) {
      const body = await res.json()
      writeStoredUser(body.user)
    } else {
      // Stash the reason so AuthProvider can surface it on the login page.
      const body = await res.json().catch(() => ({}))
      sessionStorage.setItem(
        'dasharc.signInError',
        `Sign-in failed: ${body.error || `HTTP ${res.status}`}`,
      )
    }
  } catch (err) {
    // Network error during exchange — don't claim a session we couldn't create.
    sessionStorage.setItem(
      'dasharc.signInError',
      `Sign-in failed: ${err.message || 'network error'}`,
    )
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
