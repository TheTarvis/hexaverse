import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
const gpu = vi.hoisted(() => ({ instances: [] as unknown[], native: true }))
vi.unmock('./renderer-candidate')
vi.mock('three/webgpu', () => ({ WebGPURenderer: class {
  initialized = false
  backend = { isWebGPUBackend: gpu.native, isWebGLBackend: !gpu.native, dispose: vi.fn() }
  onDeviceLost?: (info: { message?: string }) => void
  constructor(readonly options: unknown) { gpu.instances.push(this) }
  init = vi.fn(async () => { expect(this.onDeviceLost, 'loss handler must be installed before asynchronous initialization').toBeTypeOf('function'); this.initialized = true })
  renderAsync = vi.fn(async () => {})
  render = vi.fn(() => { throw new Error('synchronous submission cannot prove completed initialization/compilation') })
  setSize = vi.fn(); setPixelRatio = vi.fn(); setClearColor = vi.fn(); dispose = vi.fn()
} }))
import { createRendererCandidate } from './renderer-candidate'
afterEach(() => { gpu.instances = []; gpu.native = true; vi.restoreAllMocks() })
describe('real Three candidate adapter', () => {
  it('Scenario: Both backends fail locally — failed initialization never invokes Three disposal that restarts initialization', async () => {
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: true, alpha: false, stencil: true })
    const renderer = gpu.instances[0] as { init: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; backend: { dispose: ReturnType<typeof vi.fn> } }
    renderer.init.mockRejectedValueOnce(new Error('No graphics context'))
    await expect(candidate.init()).rejects.toThrow('No graphics context')
    candidate.dispose(); candidate.dispose()
    // Three r185 dispose() calls async setAnimationLoop(null), which calls
    // init() again while uninitialized and leaks a rejection from failed init.
    expect(renderer.dispose).not.toHaveBeenCalled()
    expect(renderer.init).toHaveBeenCalledTimes(1)
    expect(renderer.backend.dispose).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Both backends fail locally — release abandoned and failed backends even when partial cleanup throws', async () => {
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: false, alpha: false, stencil: true })
    const renderer = gpu.instances[0] as { init: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; backend: { dispose: ReturnType<typeof vi.fn> } }
    const native = renderer.backend
    const fallback = { dispose: vi.fn(() => { throw new Error('Partially initialized backend') }) }
    renderer.init.mockImplementationOnce(async () => { renderer.backend = fallback; throw new Error('Both backends failed') })
    await expect(candidate.init()).rejects.toThrow('Both backends failed')
    expect(() => { candidate.dispose(); candidate.dispose() }).not.toThrow()
    expect(renderer.dispose).not.toHaveBeenCalled()
    expect(native.dispose).toHaveBeenCalledTimes(1)
    expect(fallback.dispose).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Unmount during initialization — defer disposal until late initialization succeeds, then dispose exactly once', async () => {
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: false, alpha: false, stencil: true })
    const renderer = gpu.instances[0] as { initialized: boolean; init: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
    let resolve!: () => void
    const gate = new Promise<void>(done => { resolve = done })
    renderer.init.mockImplementationOnce(async () => { await gate; renderer.initialized = true })
    const initialization = candidate.init()
    candidate.dispose(); candidate.dispose()
    expect.soft(renderer.dispose).not.toHaveBeenCalled()
    resolve(); await initialization
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
    candidate.dispose()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Repeated teardown — initialized candidate releases Three resources only once', async () => {
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: false, alpha: true, stencil: false })
    const renderer = gpu.instances[0] as { dispose: ReturnType<typeof vi.fn> }
    await candidate.init()
    candidate.dispose(); candidate.dispose()
    expect(renderer.dispose).toHaveBeenCalledTimes(1)
  })
  it.each([true, false])('Scenario: Every owner presents through WebGPU / Missing WebGPU uses compatibility rendering — native=%s', async native => {
    gpu.native = native
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: false, alpha: true, stencil: true })
    const renderer = gpu.instances[0] as { options: unknown; renderAsync: ReturnType<typeof vi.fn>; onDeviceLost: (info: { message?: string }) => void; dispose: ReturnType<typeof vi.fn> }
    expect(renderer.options).toMatchObject({ forceWebGL: false, alpha: true, stencil: true })
    await candidate.init(); expect(candidate.backend()).toBe(native ? 'webgpu' : 'webgl2')
    const listener = vi.fn(), remove = candidate.onLoss(listener)
    renderer.onDeviceLost({ message: 'device lost' }); expect(listener).toHaveBeenCalledWith(expect.objectContaining({ message: 'device lost' }))
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
    await candidate.render(scene, camera); expect(renderer.renderAsync).toHaveBeenCalledWith(scene, camera)
    remove(); candidate.dispose(); expect(renderer.dispose).toHaveBeenCalled()
  })
  it('Scenario: Primary first-frame rejection tries compatibility — adapter propagates actual submission rejection to owner', async () => {
    const candidate = createRendererCandidate({ canvas: document.createElement('canvas'), forceWebGL: true, alpha: false, stencil: true })
    const renderer = gpu.instances[0] as { renderAsync: ReturnType<typeof vi.fn> }
    await candidate.init(); renderer.renderAsync.mockRejectedValueOnce(new Error('compilation rejected'))
    await expect(candidate.render(new THREE.Scene(), new THREE.PerspectiveCamera())).rejects.toThrow('compilation rejected')
    candidate.dispose()
  })
})
