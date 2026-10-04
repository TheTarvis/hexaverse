import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getAnalytics, type Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  // OAuth requires a nonempty domain even when all auth traffic uses the
  // emulator. Local development does not require a provisioned Firebase app.
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || (
    process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      ? `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseapp.com`
      : undefined
  ),
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

  // Ports are env-overridable so the same code can target either the dev
  // emulators (firebase.json: auth 20211 / firestore 20212) or the isolated test
  // emulators (firebase.test.json: auth 20241 / firestore 20242) used by E2E.
  // Defaults preserve the dev behavior.
  const authPort = process.env.NEXT_PUBLIC_AUTH_EMULATOR_PORT ?? '20211'
  const firestorePort = Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? '20212')

  if (!globalAny.__FIREBASE_AUTH_EMULATOR_CONNECTED__) {
    globalAny.__FIREBASE_AUTH_EMULATOR_CONNECTED__ = true
    connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`, { disableWarnings: true })
  }

  if (!globalAny.__FIREBASE_FIRESTORE_EMULATOR_CONNECTED__) {
    globalAny.__FIREBASE_FIRESTORE_EMULATOR_CONNECTED__ = true
    connectFirestoreEmulator(db, emulatorHost, firestorePort)
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