import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { mockAnimationsApi } from 'jsdom-testing-mocks'

// Mock Headless UI animations API
mockAnimationsApi()

// Silence console.log during tests (keeps warn/error for debugging)
const originalLog = console.log
console.log = (...args: unknown[]) => {
  // Only show logs if DEBUG_TESTS env var is set
  if (process.env.DEBUG_TESTS) {
    originalLog(...args)
  }
}

// Suppress act() warnings from Headless UI internals
const originalError = console.error
console.error = (...args: unknown[]) => {
  const message = args[0]?.toString() || ''

  // Suppress act() warnings from Headless UI internal components
  if (message.includes('An update to') && message.includes('inside a test was not wrapped in act(')) {
    return
  }

  originalError(...args)
}

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock Firebase
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => []),
}))

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(() => vi.fn()), // Return unsubscribe function
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  GoogleAuthProvider: vi.fn(),
}))

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
}))

// Mock window.matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver for Headless UI components
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// ---------------------------------------------------------------------------
// Renderer-availability baseline (add-renderer-availability-states)
//
// jsdom has no WebGL: `frontend` does not install the `canvas` package, so
// HTMLCanvasElement.prototype.getContext('webgl2') returns `null` (never
// throws) and emits a "Not implemented" jsdomError to stderr. Left alone,
// every test that renders a WebGL-gated surface (the galaxy graph; the
// board once the WebGL port lands) would silently land in the renderer's
// "unsupported" state — including the whole existing pre-change suite.
//
// Decided (design.md, "jsdom has no WebGL, so the test baseline must
// declare availability globally"): stub `getContext` so the DEFAULT test
// world declares WebGL AVAILABLE. Tests that want unavailability override
// `getContext` per-test — see components/render-guard/test-canvas.ts
// (stubUnsupported / stubCreationError), which restores this default
// afterward.
//
// The fake context is intentionally minimal: it exists to satisfy `probe.ts`
// (`getContext('webgl2') !== null` and
// `getExtension('WEBGL_lose_context').loseContext()`), not to be a real GL
// context. No production module in this change constructs a real
// THREE.WebGLRenderer against it.
function fakeWebglContext() {
  return {
    getExtension: (name: string) =>
      name === 'WEBGL_lose_context' ? { loseContext: () => {} } : null,
  }
}

const realGetContext = HTMLCanvasElement.prototype.getContext
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(HTMLCanvasElement.prototype as any).getContext = function (
  this: HTMLCanvasElement,
  contextId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) {
  if (contextId === 'webgl' || contextId === 'webgl2') {
    return fakeWebglContext()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (realGetContext as any)?.call(this, contextId, ...args)
}