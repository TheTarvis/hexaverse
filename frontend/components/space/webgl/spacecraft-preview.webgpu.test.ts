import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { createSpacecraftPreview } from './spacecraft-preview'
import type { RendererCandidateOptions } from '@/components/render-guard/renderer-candidate'

const art = vi.hoisted(() => ({ stars: [] as { advance: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; mesh: unknown; options: unknown }[] }))
vi.mock('./star-art', async () => {
  const THREE = await import('three')
  return { createStarModel: (options: unknown) => {
    const star = { mesh: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), options, advance: vi.fn(), dispose: vi.fn() }
    art.stars.push(star); return star
  }, stellarTint: () => 0xffd9a0 }
})
function deferred() { let resolve!: () => void; let reject!: (reason: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
let frame: FrameRequestCallback
let motion: EventTarget & { matches: boolean }
beforeEach(() => {
  art.stars = []; motion = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => motion)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn()); vi.stubGlobal('devicePixelRatio', 4)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount(backend: 'webgpu' | 'webgl2' = 'webgpu') {
  const entries: { options: RendererCandidateOptions; init: ReturnType<typeof deferred>; submission: ReturnType<typeof deferred>; render: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; loss: () => void }[] = []
  const factory = vi.fn((options: RendererCandidateOptions) => {
    const entry = { options, init: deferred(), submission: deferred(), render: vi.fn(), resize: vi.fn(), dispose: vi.fn(), loss: () => {} }; entries.push(entry)
    entry.render.mockImplementation(() => entry.submission.promise)
    return { canvas: options.canvas, init: () => entry.init.promise, backend: () => options.forceWebGL ? 'webgl2' as const : backend, render: entry.render,
      resize: entry.resize, dispose: entry.dispose, setClearColor: vi.fn(), onLoss: (listener: (info: { message?: string }) => void) => { entry.loss = () => listener({}); return vi.fn() } }
  })
  const status = vi.fn(), canvases: HTMLCanvasElement[] = []
  const controller = createSpacecraftPreview(document.createElement('canvas'), 'star', 0xffffff, status, 'served-id', {
    starClass: 'O', rendererFactory: factory, createCanvas: () => document.createElement('canvas'), onCanvas: canvas => canvases.push(canvas),
  })
  expect(entries, 'preview must construct its candidate through the contracted owner seam').toHaveLength(1)
  controller.resize(300, 200)
  const ready = async (index = 0) => { entries[index]!.init.resolve(); entries[index]!.submission.resolve(); await settle(); if (frame) frame(100); await settle() }
  return { controller, entries, status, factory, canvases, ready }
}
describe('actual selected-star preview wiring', () => {
  it.each(['webgpu', 'webgl2'] as const)('Scenario: Every owner presents through WebGPU / Selected stellar model matches the map — preview %s', async backend => {
    const h = mount(backend); expect(h.status).not.toHaveBeenCalledWith('ready')
    h.controller.rotate(0.4, 0.2); h.entries[0]!.init.resolve(); await settle()
    expect(h.status).not.toHaveBeenCalledWith('ready')
    h.entries[0]!.submission.resolve(); await settle(); frame(100); await settle()
    expect(h.status).toHaveBeenCalledWith('ready')
    expect(art.stars).toHaveLength(1); expect(art.stars[0]!.options).toMatchObject({ objectId: 'served-id', starClass: 'O' })
    const model = art.stars[0]!.mesh as THREE.Mesh
    expect(model.rotation.y).toBeCloseTo(0.4); expect(model.rotation.x).toBeCloseTo(0.2)
    expect(h.entries[0]!.options.alpha).toBe(true)
    for (const [width, height, ratio] of h.entries[0]!.resize.mock.calls) expect(Math.max(width, height) * ratio).toBeLessThanOrEqual(384)
    h.controller.dispose(); expect(art.stars[0]!.dispose).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Primary first-frame rejection tries compatibility / Preview failure leaves stellar details usable', async () => {
    const h = mount(); h.entries[0]!.init.resolve(); await settle(); h.entries[0]!.submission.reject(new Error('compile')); await settle()
    expect(h.entries).toHaveLength(2); expect(h.entries[0]!.dispose).toHaveBeenCalled()
    expect(h.canvases[1]).not.toBe(h.canvases[0]); expect(h.entries[1]!.options.forceWebGL).toBe(true)
    await h.ready(1); expect(h.status).toHaveBeenCalledWith('ready')
    h.entries[1]!.loss(); await settle(); expect(h.status).toHaveBeenLastCalledWith('interrupted')
    h.controller.retry(); h.controller.retry(); expect(h.entries).toHaveLength(3)
    h.controller.dispose()
  })
  it('Scenario: Preview closes before initialization settles', async () => {
    const h = mount(); h.controller.dispose(); h.status.mockClear(); h.entries[0]!.init.resolve(); await settle()
    expect(h.entries[0]!.render).not.toHaveBeenCalled(); expect(h.status).not.toHaveBeenCalled(); expect(art.stars[0]!.dispose).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Reduced motion freezes decoration without freezing state / Hidden preview does not draw and resumes once', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
    const h = mount(); await h.ready(); const star = art.stars[0]!, pose = (star.mesh as THREE.Mesh).quaternion.clone()
    star.advance.mockClear(); frame(140); await settle(); expect(star.advance).toHaveBeenCalled()
    expect((star.mesh as THREE.Mesh).quaternion.equals(pose)).toBe(true)
    motion.matches = true; motion.dispatchEvent(new Event('change')); star.advance.mockClear()
    frame(180); await settle(); expect(star.advance).not.toHaveBeenCalled()
    const draws = h.entries[0]!.render.mock.calls.length
    h.controller.rotate(0.2, 0.1); await settle(); expect(h.entries[0]!.render.mock.calls.length).toBeGreaterThan(draws)
    motion.matches = false; motion.dispatchEvent(new Event('change'))
    hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')); star.advance.mockClear()
    frame(10000); await settle(); expect(star.advance).not.toHaveBeenCalled()
    hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'))
    frame(20000); await settle(); frame(20040); await settle()
    expect(star.advance.mock.calls.every(([seconds]) => seconds <= 0.1)).toBe(true)
    h.controller.dispose()
  })
})

it('Scenario: Deliberate presentation suspension does not time out — reduced-motion preview initialized hidden presents on visibility return', async () => {
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  motion.matches = true
  const h = mount()
  h.entries[0]!.init.resolve(); h.entries[0]!.submission.resolve(); await settle()
  expect(h.entries[0]!.render).not.toHaveBeenCalled()
  expect(h.status).not.toHaveBeenCalledWith('ready')
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  await settle()
  expect(h.entries[0]!.render, 'visibility must request the first current-state frame even when decoration has no RAF').toHaveBeenCalledTimes(1)
  expect(h.status).toHaveBeenLastCalledWith('ready')
  expect(art.stars[0]!.advance).not.toHaveBeenCalled()
  h.controller.dispose()
})
