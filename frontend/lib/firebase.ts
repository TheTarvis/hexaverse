import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAnalytics, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

let app: FirebaseApp
let analytics: Analytics | undefined

if (!getApps().length) {
  app = initializeApp(firebaseConfig)
} else {
  app = getApps()[0]
}

const auth = getAuth(app)
const db = getFirestore(app)

// Connect to Firebase emulators in development
if (process.env.NODE_ENV === 'development') {
  // Track if we've already connected to avoid reconnection errors
  const globalAny = global as typeof globalThis & {
    __FIREBASE_AUTH_EMULATOR_CONNECTED__?: boolean
    __FIREBASE_FIRESTORE_EMULATOR_CONNECTED__?: boolean
  }

  const emulatorHost = process.env.NEXT_PUBLIC_EMULATOR_HOST || '127.0.0.1'

  if (!globalAny.__FIREBASE_AUTH_EMULATOR_CONNECTED__) {
    globalAny.__FIREBASE_AUTH_EMULATOR_CONNECTED__ = true
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true })
  }

  if (!globalAny.__FIREBASE_FIRESTORE_EMULATOR_CONNECTED__) {
    globalAny.__FIREBASE_FIRESTORE_EMULATOR_CONNECTED__ = true
    connectFirestoreEmulator(db, emulatorHost, 8080)
  }
}

// Analytics only works in the browser and with a valid API key
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'demo-api-key') {
  try {
    analytics = getAnalytics(app)
  } catch (error) {
    console.warn('Firebase Analytics initialization failed:', error)
  }
}

export { app, auth, db, analytics }