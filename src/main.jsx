import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureMsalReady } from './lib/msal'
import { writeAuthSession } from './lib/auth-storage'

// If we're returning from a Microsoft loginRedirect, MSAL processes the URL
// here and gives us the ID token; persist it so AuthProvider picks it up
// during its initial state setup. Synchronous storage write before render.
const result = await ensureMsalReady()
if (result?.idToken) writeAuthSession(result.idToken)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
