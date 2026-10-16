import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: '[DEFAULT]' })),
  connectAuthEmulator: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  getAnalytics: vi.fn(),
}))

vi.mock('firebase/app', () => ({ initializeApp: mocks.initializeApp, getApps: () => [] }))
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), connectAuthEmulator: mocks.connectAuthEmulator }))
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), connectFirestoreEmulator: mocks.connectFirestoreEmulator }))
vi.mock('firebase/analytics', () => ({ getAnalytics: mocks.getAnalytics }))
vi.unmock('@/lib/firebase')

function clearEmulatorLatches() {
  const state = globalThis as typeof globalThis & {
    __FIREBASE_AUTH_EMULATOR_CONNECTED__?: boolean
    __FIREBASE_FIRESTORE_EMULATOR_CONNECTED__?: boolean
  }
  delete state.__FIREBASE_AUTH_EMULATOR_CONNECTED__
  delete state.__FIREBASE_FIRESTORE_EMULATOR_CONNECTED__
}

describe('Firebase emulator OAuth configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    clearEmulatorLatches()
    vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', '')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'demo-api-key')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'example-emulator')
    vi.stubEnv('NODE_ENV', 'development')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    clearEmulatorLatches()
  })

  it.each(['', undefined])('supports emulator OAuth with authDomain %s', async (domain) => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', domain)
    await import('@/lib/firebase')
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'demo-api-key',
      projectId: 'example-emulator',
      authDomain: 'example-emulator.firebaseapp.com',
    }))
    expect(mocks.connectAuthEmulator).toHaveBeenCalledTimes(1)
  })

  it('preserves an explicitly configured auth domain', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'auth.example.com')
    await import('@/lib/firebase')
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ authDomain: 'auth.example.com' }))
  })

  it('does not invent a domain when the local project ID is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', '')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', '')
    await import('@/lib/firebase')
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ authDomain: undefined }))
  })

  it.each(['', undefined])('does not apply emulator defaults in production with authDomain %s', async (domain) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', domain)
    await import('@/lib/firebase')
    expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ authDomain: undefined }))
    expect(mocks.connectAuthEmulator).not.toHaveBeenCalled()
  })
})


it('explicitly enables same-origin Auth emulator in an isolated production preview without Firestore or analytics', async () => {
  vi.resetModules(); vi.clearAllMocks(); clearEmulatorLatches()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', 'true')
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'hexaverse-emulator')
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'inherited-public-config-key')
  await import('@/lib/firebase')
  expect(mocks.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'demo-api-key', projectId: 'hexaverse-emulator', authDomain: 'hexaverse-emulator.firebaseapp.com' }))
  expect(mocks.connectAuthEmulator).toHaveBeenCalledWith(expect.anything(), window.location.origin, { disableWarnings: true })
  expect(mocks.connectFirestoreEmulator).not.toHaveBeenCalled()
  expect(mocks.getAnalytics).not.toHaveBeenCalled()
  vi.unstubAllEnvs(); clearEmulatorLatches()
})
