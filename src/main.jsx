import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ensureMsalReady } from './lib/msal'

// MSAL must process any auth response in the URL (e.g. popup callback ?code=...)
// before React mounts and ProtectedRoute redirects to /login, stripping it.
await ensureMsalReady()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
