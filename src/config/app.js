// Tenant-specific configuration — all values come from .env
// To deploy for a new client: copy .env.example → .env, fill in their values.

const appConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'DashARC',
  companyName: import.meta.env.VITE_COMPANY_NAME || 'SalesARC',
  useMockData: import.meta.env.VITE_USE_MOCK_DATA === 'true',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
}

export default appConfig
