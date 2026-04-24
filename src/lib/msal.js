import { PublicClientApplication } from '@azure/msal-browser'
import appConfig from '../config/app'

// Singleton — only instantiated when Microsoft is configured for this deployment.
export const msalInstance = appConfig.microsoftClientId
  ? new PublicClientApplication({
      auth: {
        clientId: appConfig.microsoftClientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
        // We handle post-auth navigation ourselves via React Router; don't let
        // MSAL re-navigate after processing the callback.
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: 'sessionStorage' },
    })
  : null

let initPromise = null

// Initialize MSAL and process any redirect callback present in the URL.
// Returns the AuthenticationResult if a redirect just completed, otherwise null.
// Idempotent.
export function ensureMsalReady() {
  if (!msalInstance) return Promise.resolve(null)
  if (!initPromise) {
    initPromise = msalInstance
      .initialize()
      .then(() => msalInstance.handleRedirectPromise())
      .catch((err) => {
        console.warn('MSAL init/redirect failed:', err)
        return null
      })
  }
  return initPromise
}
