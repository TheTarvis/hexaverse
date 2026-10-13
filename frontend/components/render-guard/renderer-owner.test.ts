import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createRendererOwner, RENDERER_INIT_BUDGET_MS, RENDERER_FIRST_FRAME_BUDGET_MS } from './renderer-owner'
import type { RendererCandidate, RendererCandidateOptions } from './renderer-candidate'

function deferred() {
  let resolve!: (value: void | PromiseLike<void>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
function harness(backends: ('webgpu' | 'webgl2')[] = []) {
  const candidates: (RendererCandidate & { initialization: ReturnType<typeof deferred>; loss: (info: { message?: string }) => void })[] = []
  const events: string[] = []
  const state = vi.fn(), record = vi.fn(), onCanvas = vi.fn()
  const factory = vi.fn((options: RendererCandidateOptions) => {
    const index = candidates.length
    const initialization = deferred()
    const candidate = {
      canvas: options.canvas, initialization,
      init: vi.fn(() => initialization.promise),
      backend: () => backends[index] ?? (options.forceWebGL ? 'webgl2' as const : 'webgpu' as const),
      render: vi.fn(), resize: vi.fn(), setClearColor: vi.fn(),
      loss: (_info: { message?: string }) => {},
      onLoss: vi.fn((listener: (info: { message?: string }) => void) => { candidate.loss = listener; return () => { events.push(`unlisten:${index}`) } }),
      dispose: vi.fn(() => { events.push(`dispose:${index}`) }),
    }
    events.push(`create:${index}`); candidates.push(candidate)
    return candidate
  })
  const owner = createRendererOwner({ surface: 'space', alpha: false, stencil: true,
    createCanvas: () => document.createElement('canvas'), onCanvas, onState: state, factory, record })
  owner.resize(320, 200, 2)
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
  const initialized = async (index = 0) => { candidates[index]!.initialization.resolve(); await flush() }
  const ready = async (index = 0) => { await initialized(index); owner.setPresentationEligible(true); expect(await owner.present(scene, camera)).toBe(true) }
  return { owner, candidates, events, state, record, factory, scene, camera, initialized, ready, onCanvas }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('migrate-platform-webgpu renderer ownership', () => {
  it('Scenario: Browser deadline timers retain a valid global receiver through initialization and presentation', async () => {
    const schedule = vi.spyOn(globalThis, 'setTimeout')
    const cancel = vi.spyOn(globalThis, 'clearTimeout')
    const h = harness()
    try {
      await h.ready()
      expect(h.owner.snapshot().phase).toBe('ready')
      expect(schedule).toHaveBeenCalled()
      expect(cancel).toHaveBeenCalled()
      // Native browser timers reject a private clock object as their receiver.
      // Fake timers accept it, so check the browser receiver contract explicitly.
      for (const timer of [schedule, cancel]) {
        expect(timer.mock.contexts.every(receiver => receiver === undefined || receiver === globalThis)).toBe(true)
      }
    } finally {
      h.owner.dispose()
    }
  })
  it.each(['webgpu', 'webgl2'] as const)('Scenario: Missing WebGPU uses compatibility rendering / Every owner presents through WebGPU — actual %s', async backend => {
    const h = harness([backend]); await h.initialized()
    expect(h.factory.mock.calls[0]![0].forceWebGL).toBe(false)
    expect(h.owner.snapshot()).toMatchObject({ phase: 'pending', backend })
    h.owner.setPresentationEligible(true)
    const frame = deferred(); vi.mocked(h.candidates[0]!.render).mockReturnValueOnce(frame.promise)
    const pending = h.owner.present(h.scene, h.camera)
    expect(h.owner.snapshot().phase).toBe('pending')
    frame.resolve(); expect(await pending).toBe(true)
    expect(h.owner.snapshot()).toEqual({ phase: 'ready', backend, retrying: false })
    h.owner.dispose()
  })
  it('Scenario: Rejected WebGPU initialization uses compatibility rendering', async () => {
    const h = harness(); h.candidates[0]!.initialization.reject(new Error('adapter denied')); await flush()
    expect(h.factory).toHaveBeenCalledTimes(2)
    expect(h.events.indexOf('dispose:0')).toBeLessThan(h.events.indexOf('create:1'))
    expect(h.factory.mock.calls[1]![0].forceWebGL).toBe(true)
    expect(h.candidates[1]!.canvas).not.toBe(h.candidates[0]!.canvas)
    await h.ready(1); expect(h.owner.snapshot().backend).toBe('webgl2'); h.owner.dispose()
  })
  it('Scenario: Both backends fail locally / Broken diagnostics cannot block recovery UI', async () => {
    const h = harness(); h.record.mockImplementation(() => { throw new Error('logger') })
    h.candidates[0]!.initialization.reject(new Error('primary')); await flush()
    h.candidates[1]!.initialization.reject(new Error('compatibility')); await flush()
    expect(h.owner.snapshot()).toMatchObject({ phase: 'unavailable', retrying: false })
    expect(h.factory).toHaveBeenCalledTimes(2); h.owner.dispose()
  })
  it.each(['throw', 'reject'] as const)('Scenario: Primary first-frame rejection tries compatibility — %s', async mode => {
    const h = harness(); await h.initialized(); h.owner.setPresentationEligible(true)
    vi.mocked(h.candidates[0]!.render).mockImplementationOnce(() => { if (mode === 'throw') throw new Error('compile'); return Promise.reject(new Error('submit')) })
    expect(await h.owner.present(h.scene, h.camera)).toBe(false); await flush()
    expect(h.factory).toHaveBeenCalledTimes(2); expect(h.owner.snapshot().phase).toBe('pending')
    expect(h.events.indexOf('dispose:0')).toBeLessThan(h.events.indexOf('create:1'))
    await h.ready(1); h.owner.dispose()
  })
  it('Scenario: Compatibility first-frame failure is retriable', async () => {
    const h = harness(['webgl2']); await h.initialized(); h.owner.setPresentationEligible(true)
    vi.mocked(h.candidates[0]!.render).mockRejectedValueOnce(new Error('compile'))
    expect(await h.owner.present(h.scene, h.camera)).toBe(false)
    expect(h.owner.snapshot()).toMatchObject({ phase: 'unavailable', retrying: false })
    expect(h.factory).toHaveBeenCalledTimes(1); h.owner.dispose()
  })
  it.each(['resolve', 'reject'] as const)('Scenario: Preview closes before initialization settles / Route replacement ignores stale completion — %s', async completion => {
    const h = harness(); h.owner.dispose(); h.state.mockClear()
    if (completion === 'resolve') h.candidates[0]!.initialization.resolve()
    else h.candidates[0]!.initialization.reject(new Error('late'))
    await flush()
    expect(h.owner.snapshot().phase).toBe('disposed'); expect(h.state).not.toHaveBeenCalled()
    expect(await h.owner.present(h.scene, h.camera)).toBe(false)
    expect(h.candidates[0]!.render).not.toHaveBeenCalled()
    expect(h.candidates[0]!.dispose).toHaveBeenCalled()
  })
  it('Scenario: Zero-size initialization defers presentation', async () => {
    const h = harness(); h.owner.resize(0, 200); await h.initialized()
    expect(await h.owner.present(h.scene, h.camera)).toBe(false)
    expect(h.candidates[0]!.render).not.toHaveBeenCalled()
    h.owner.resize(320, 200); h.owner.setPresentationEligible(true)
    expect(await h.owner.present(h.scene, h.camera)).toBe(true)
    expect(h.candidates[0]!.resize).toHaveBeenLastCalledWith(320, 200, expect.any(Number)); expect(h.factory).toHaveBeenCalledTimes(1); h.owner.dispose()
  })
  it('Scenario: Stalled primary initialization reaches compatibility', async () => {
    const h = harness(); expect(RENDERER_INIT_BUDGET_MS).toBe(15000)
    await vi.advanceTimersByTimeAsync(14999); expect(h.factory).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); expect(h.factory).toHaveBeenCalledTimes(2)
    await h.initialized(0); expect(h.owner.snapshot().phase).toBe('pending'); expect(h.candidates[0]!.render).not.toHaveBeenCalled()
    await h.ready(1); expect(h.owner.snapshot().backend).toBe('webgl2'); h.owner.dispose()
  })
  it('Scenario: First presentation has its own eligible-time bound / Deliberate presentation suspension does not time out', async () => {
    const h = harness(); await vi.advanceTimersByTimeAsync(14999); await h.initialized()
    expect(RENDERER_FIRST_FRAME_BUDGET_MS).toBe(15000)
    await vi.advanceTimersByTimeAsync(60000); expect(h.factory).toHaveBeenCalledTimes(1)
    h.owner.setPresentationEligible(true); await vi.advanceTimersByTimeAsync(10000)
    h.owner.setPresentationEligible(false); await vi.advanceTimersByTimeAsync(60000)
    expect(h.factory).toHaveBeenCalledTimes(1)
    h.owner.setPresentationEligible(true); await vi.advanceTimersByTimeAsync(4999); expect(h.factory).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1); expect(h.factory).toHaveBeenCalledTimes(2); h.owner.dispose()
  })
  it('SDET-added: first-frame success at 14999ms cancels the deadline; a stale in-flight frame cannot establish readiness', async () => {
    const h = harness(); await h.initialized(); h.owner.setPresentationEligible(true)
    await vi.advanceTimersByTimeAsync(14999); expect(await h.owner.present(h.scene, h.camera)).toBe(true)
    await vi.advanceTimersByTimeAsync(60000); expect(h.factory).toHaveBeenCalledTimes(1); h.owner.dispose()
    const late = harness(); await late.initialized(); late.owner.setPresentationEligible(true)
    const frame = deferred(); vi.mocked(late.candidates[0]!.render).mockReturnValueOnce(frame.promise)
    const presentation = late.owner.present(late.scene, late.camera)
    expect(await late.owner.present(late.scene, late.camera)).toBe(false)
    expect(late.candidates[0]!.render).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15000); frame.resolve(); expect(await presentation).toBe(false)
    expect(late.owner.snapshot().phase).toBe('pending'); late.owner.dispose()
  })
  it('Scenario: Repeated loss and retry are bounded / WebGPU device loss requires explicit recreation', async () => {
    const h = harness(); await h.ready()
    h.candidates[0]!.loss({ message: 'device gone' }); h.candidates[0]!.loss({})
    expect(h.owner.snapshot()).toMatchObject({ phase: 'interrupted', retrying: false })
    await vi.advanceTimersByTimeAsync(60000); expect(h.factory).toHaveBeenCalledTimes(1)
    h.owner.retry(); h.owner.retry(); expect(h.factory).toHaveBeenCalledTimes(2)
    expect(h.owner.snapshot()).toMatchObject({ phase: 'interrupted', retrying: true })
    expect(h.events.indexOf('dispose:0')).toBeLessThan(h.events.indexOf('create:1'))
    await h.ready(1); h.candidates[0]!.loss({ message: 'obsolete' }); expect(h.owner.snapshot().phase).toBe('ready'); h.owner.dispose()
  })
  it.each(['init', 'frame'] as const)('Scenario: Stalled compatibility retry becomes retriable again — %s', async stage => {
    const h = harness(); await h.ready(); h.candidates[0]!.loss({}); h.owner.retry()
    h.candidates[1]!.initialization.reject(new Error('native retry')); await flush()
    if (stage === 'frame') { await h.initialized(2); h.owner.setPresentationEligible(true) }
    await vi.advanceTimersByTimeAsync(14999); expect(h.owner.snapshot().retrying).toBe(true)
    await vi.advanceTimersByTimeAsync(1); expect(h.owner.snapshot()).toMatchObject({ phase: 'interrupted', retrying: false })
    expect(h.factory).toHaveBeenCalledTimes(3); h.owner.dispose()
  })
  it.each(['frame-throw', 'frame-reject', 'resize', 'update-throw', 'update-reject'] as const)('Scenario: Post-readiness frame failure is local / Resize or scene-update failure is local — %s', async failure => {
    const h = harness(), independent = harness(); await h.ready(); await independent.ready()
    if (failure === 'resize') { vi.mocked(h.candidates[0]!.resize).mockImplementationOnce(() => { throw new Error('resize') }); expect(() => h.owner.resize(500, 300)).not.toThrow() }
    else if (failure.startsWith('update')) await expect(h.owner.update(() => { if (failure === 'update-throw') throw new Error('update'); return Promise.reject(new Error('update')) })).resolves.toBeUndefined()
    else { vi.mocked(h.candidates[0]!.render).mockImplementationOnce(() => { if (failure === 'frame-throw') throw new Error('draw'); return Promise.reject(new Error('draw')) }); expect(await h.owner.present(h.scene, h.camera)).toBe(false) }
    expect(h.owner.snapshot()).toMatchObject({ phase: 'interrupted', retrying: false }); expect(h.factory).toHaveBeenCalledTimes(1)
    expect(await independent.owner.present(independent.scene, independent.camera)).toBe(true)
    h.owner.dispose(); independent.owner.dispose()
  })
  it('Scenario: A restored context resumes without navigation — compatibility restoration recreates only once', async () => {
    const h = harness(['webgl2']); await h.ready(); const canvas = h.candidates[0]!.canvas
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })); h.candidates[0]!.loss({})
    expect(h.owner.snapshot().phase).toBe('interrupted')
    canvas.dispatchEvent(new Event('webglcontextrestored')); await flush()
    expect(h.factory).toHaveBeenCalledTimes(2)
    canvas.dispatchEvent(new Event('webglcontextrestored')); expect(h.factory).toHaveBeenCalledTimes(2)
    await h.ready(1); h.owner.dispose()
  })
})

it('Scenario: Asynchronous retry rejection remains contained / Renderer failures are recorded distinguishably by cause', async () => {
  const h = harness(); await h.ready(); h.candidates[0]!.loss({ message: 'native lost' }); h.owner.retry(); h.owner.retry()
  expect(h.factory).toHaveBeenCalledTimes(2)
  h.candidates[1]!.initialization.reject(new Error('primary retry denied')); await flush()
  h.candidates[2]!.initialization.reject(new Error('compatibility denied')); await flush()
  expect(h.owner.snapshot()).toMatchObject({ phase: 'interrupted', retrying: false })
  expect(h.factory).toHaveBeenCalledTimes(3)
  expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ surface: 'space', stage: 'lost', backend: 'webgpu' }))
  expect(h.record).toHaveBeenCalledWith(expect.objectContaining({ surface: 'space', stage: 'init' }))
  h.owner.retry(); expect(h.factory).toHaveBeenCalledTimes(4); h.owner.dispose()
})
