import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureMsalReady } from './lib/msal'
import { writeAuthSession } from './lib/auth-storage'

// If we're returning from a Microsoft loginRedirect, MSAL processes the URL
// here and gives us the ID token. Verify it against the server's allowlist
// BEFORE writing the session — symmetric with the Google sign-in flow in
// useAuth.signIn — so unauthorized users never see the dashboard chrome.
const result = await ensureMsalReady()
if (result?.idToken) {
  try {
    const verify = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${result.idToken}` },
    })
    if (verify.ok) {
      writeAuthSession(result.idToken)
    } else {
      // Stash the reason so AuthProvider can surface it on the login page.
      const body = await verify.json().catch(() => ({}))
      sessionStorage.setItem(
        'dasharc.signInError',
        `Sign-in failed: ${body.error || `HTTP ${verify.status}`}`,
      )
    }
  } catch (err) {
    // Network error during verify — don't write a session we can't trust.
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
