// test-canvas.ts — shared WebGL-simulation helpers for the render-guard suite
// (add-renderer-availability-states). jsdom has no WebGL; vitest.setup.ts
// stubs `HTMLCanvasElement.prototype.getContext` so the default test world
// declares WebGL AVAILABLE (design.md, "jsdom has no WebGL, so the test
// baseline must declare availability globally"). These helpers are the
// per-test overrides for the world that wants something else, plus the
// synthetic loss/restore event dispatchers. Do NOT build a real GL harness
// in jsdom on top of these (design.md, "two testability notes") — they are
// the whole simulation surface this change's tests are allowed to use.
//
// vi is a test-only dependency; this file is only ever imported from *.test
// files, never from production code.
import { vi } from 'vitest'

// A fake WebGL context shaped like what `vitest.setup.ts`'s default stub
// returns, but with inspectable spies: `getExtension` is itself a spy (so a
// test can assert it was called with 'WEBGL_lose_context'), and the handle
// it returns for that extension is STABLE across calls (so a test can assert
// `loseContext` was invoked without needing to re-derive the same object the
// production code already holds).
export interface FakeGlContext {
  getExtension: ReturnType<typeof vi.fn>
  loseContext: ReturnType<typeof vi.fn>
}

export function fakeGlContext(): FakeGlContext {
  const loseContext = vi.fn()
  const handle = { loseContext }
  const getExtension = vi.fn((name: string) => (name === 'WEBGL_lose_context' ? handle : null))
  return { getExtension, loseContext }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GetContextFn = (this: HTMLCanvasElement, contextId: string, ...args: any[]) => any

function installGetContext(impl: GetContextFn): () => void {
  const original = HTMLCanvasElement.prototype.getContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(HTMLCanvasElement.prototype as any).getContext = impl
  return () => {
    HTMLCanvasElement.prototype.getContext = original
  }
}

// Simulates "a rendering context cannot be created" with NO browser
// diagnostic: `getContext('webgl'|'webgl2')` returns `null`, exactly like
// jsdom's own un-stubbed behaviour — never throws. Explicit opt-in against
// the global available-by-default stub (vitest.setup.ts).
//
// Returns a restore function; call it (directly, or via `afterEach`) to put
// the default-available stub back for the next test.
export function stubUnsupported(): () => void {
  return installGetContext(function (contextId) {
    if (contextId === 'webgl' || contextId === 'webgl2') return null
    return null
  })
}

// Simulates a creation failure WITH a browser-reported diagnostic: dispatches
// `webglcontextcreationerror` (carrying `statusMessage`) on the probing
// canvas BEFORE returning `null` from `getContext` — covers the probe's
// one-shot listener path and the recorder's `detail`.
//
// Returns a restore function; call it to put the default-available stub back.
export function stubCreationError(statusMessage: string): () => void {
  return installGetContext(function (contextId) {
    if (contextId === 'webgl' || contextId === 'webgl2') {
      const event = new Event('webglcontextcreationerror')
      // WebGLContextEvent isn't constructible with a statusMessage in jsdom;
      // a plain Event augmented with the field the real event carries reads
      // identically to anything probe.ts can observe (`event.statusMessage`).
      Object.assign(event, { statusMessage })
      this.dispatchEvent(event)
      return null
    }
    return null
  })
}

// Simulates a runtime context loss on an already-live canvas.
export function loseContext(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('webglcontextlost'))
}

// Simulates the browser restoring a previously-lost context.
export function restoreContext(canvas: HTMLCanvasElement): void {
  canvas.dispatchEvent(new Event('webglcontextrestored'))
}
