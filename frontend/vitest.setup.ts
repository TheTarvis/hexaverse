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
// PointerEvent polyfill (openspec build-production-space-view). jsdom ships
// no `PointerEvent` constructor, so Testing Library's `fireEvent.pointerDown`
// falls back to a bare `Event` — which silently DROPS `clientX`/`clientY`,
// `button` and `pointerId`. Every pointer-driven assertion in a suite then
// runs against coordinate-less events, and a 4-pixel press becomes
// indistinguishable from a 40-pixel drag: the click/gesture threshold, the
// pick position, and the primary/secondary button split all stop being
// observable. This is an ENVIRONMENT gap, not a product behaviour — the
// polyfill below is the smallest thing that makes a fired pointer event
// carry what a browser's would.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly width: number
    readonly height: number
    readonly pressure: number
    readonly tangentialPressure: number
    readonly tiltX: number
    readonly tiltY: number
    readonly twist: number
    readonly pointerType: string
    readonly isPrimary: boolean

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.width = init.width ?? 1
      this.height = init.height ?? 1
      this.pressure = init.pressure ?? 0
      this.tangentialPressure = init.tangentialPressure ?? 0
      this.tiltX = init.tiltX ?? 0
      this.tiltY = init.tiltY ?? 0
      this.twist = init.twist ?? 0
      this.pointerType = init.pointerType ?? 'mouse'
      this.isPrimary = init.isPrimary ?? true
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).PointerEvent = PointerEventPolyfill
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).PointerEvent = PointerEventPolyfill
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
    if (!(name in Element.prototype)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(Element.prototype as any)[name] = function () {
        return name === 'hasPointerCapture' ? false : undefined
      }
    }
  }
}
