// Test-only candidate and deterministic frame clock; no GPU capability probe.
import { vi } from 'vitest'
import { act } from '@testing-library/react'
import type { Camera, Scene } from 'three'

export function deferred() {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

export function rendererHarness() {
  const candidates: ReturnType<typeof makeCandidate>[] = []
  const plans: { init?: ReturnType<typeof deferred>; frame?: ReturnType<typeof deferred>; backend?: 'webgpu' | 'webgl2' }[] = []
  function makeCandidate(options: { canvas: HTMLCanvasElement; forceWebGL: boolean }) {
    const plan = plans.shift() ?? {}
    let loss: ((info: { message?: string }) => void) | null = null
    return {
      canvas: options.canvas,
      forceWebGL: options.forceWebGL,
      init: vi.fn(() => plan.init?.promise ?? Promise.resolve()),
      backend: () => plan.backend ?? (options.forceWebGL ? 'webgl2' : 'webgpu'),
      render: vi.fn((_scene: Scene, _camera: Camera) => plan.frame?.promise ?? Promise.resolve()),
      resize: vi.fn(), setClearColor: vi.fn(), dispose: vi.fn(),
      onLoss: vi.fn((listener: (info: { message?: string }) => void) => {
        loss = listener
        return () => { loss = null }
      }),
      lose: () => loss?.({ message: 'test device loss' }),
    }
  }
  const factory = vi.fn((options: { canvas: HTMLCanvasElement; forceWebGL: boolean }) => {
    const candidate = makeCandidate(options)
    candidates.push(candidate)
    return candidate
  })
  return { candidates, plans, factory }
}

export function installPresentationEnvironment() {
  vi.useFakeTimers()
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, toJSON() {} })
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  // Reinstall per test: restoreAllMocks resets the suite's shared constructor.
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) { this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver) }
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) { this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver) }
    unobserve() {}
    disconnect() {}
  })
  // Only texture painting is faked. CPU geometry/cameras/raycasts stay real.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind: string) => {
    if (kind !== '2d') return null
    return { clearRect() {}, fillRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {}, measureText: () => ({ width: 100 }), createRadialGradient: () => ({ addColorStop() {} }) } as unknown as CanvasRenderingContext2D
  })
}

export async function frames(count = 4) {
  await act(async () => {
    for (let i = 0; i < count; i++) await vi.advanceTimersByTimeAsync(17)
  })
}
