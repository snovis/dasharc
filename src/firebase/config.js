import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const hasCredentials = import.meta.env.VITE_FIREBASE_API_KEY

// Only initialize Firebase when credentials are present.
// In mock mode (VITE_USE_MOCK_DATA=true), these exports are never called.
const app = hasCredentials
  ? initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })
  : null

export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
