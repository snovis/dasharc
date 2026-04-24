import { PublicClientApplication } from '@azure/msal-browser'
import appConfig from '../config/app'

// Singleton — instantiated only when Microsoft is configured for this deployment.
export const msalInstance = appConfig.microsoftClientId
  ? new PublicClientApplication({
      auth: {
        clientId: appConfig.microsoftClientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
      },
      cache: { cacheLocation: 'sessionStorage' },
    })
  : null

let initPromise = null

// Initializes MSAL and runs handleRedirectPromise. Idempotent.
// Must run before React renders so popup callbacks (?code=...) are processed
// before ProtectedRoute can strip the URL.
export function ensureMsalReady() {
  if (!msalInstance) return Promise.resolve(false)
  if (!initPromise) {
    initPromise = msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .then(() => true)
      .catch((err) => {
        console.warn('MSAL init failed:', err)
        return false
      })
  }
  return initPromise
}
