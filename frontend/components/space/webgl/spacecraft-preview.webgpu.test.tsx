import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SpacecraftPreview } from '../SpacecraftPreview'
import type { RendererCandidateOptions } from '@/components/render-guard/renderer-candidate'

const art = vi.hoisted(() => ({ stars: [] as { advance: ReturnType<typeof vi.fn>; mesh: unknown; options: unknown }[] }))
vi.mock('./star-art', async () => {
  const THREE = await import('three')
  return { createStarModel: (options: unknown) => {
    const star = { mesh: new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial()), options, advance: vi.fn() }
    art.stars.push(star)
    return star
  } }
})
function deferred() { let resolve!: () => void; let reject!: (reason: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = async () => { await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }) }
let frames: Map<number, FrameRequestCallback>, sequence: number
let motion: EventTarget & { matches: boolean }
async function frame(now: number) {
  const callbacks = [...frames.values()]
  frames.clear()
  await act(async () => { callbacks.forEach(callback => callback(now)) })
  await settle()
}
beforeEach(() => {
  art.stars = []
  frames = new Map(); sequence = 0
  motion = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => motion)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal('devicePixelRatio', 4)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function mount(backend: 'webgpu' | 'webgl2' = 'webgpu') {
  const entries: { options: RendererCandidateOptions; init: ReturnType<typeof deferred>; submission: ReturnType<typeof deferred>; render: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; loss: () => void }[] = []
  const factory = vi.fn((options: RendererCandidateOptions) => {
    const entry = { options, init: deferred(), submission: deferred(), render: vi.fn(), resize: vi.fn(), dispose: vi.fn(), loss: () => {} }
    entries.push(entry)
    entry.render.mockImplementation(() => entry.submission.promise)
    return { canvas: options.canvas, init: () => entry.init.promise, backend: () => options.forceWebGL ? 'webgl2' as const : backend, render: entry.render,
      resize: entry.resize, dispose: entry.dispose, setClearColor: vi.fn(), onLoss: (listener: (info: { message?: string }) => void) => { entry.loss = () => listener({}); return vi.fn() } }
  })
  const host = render(<div><SpacecraftPreview kind="star" label="Selected star" objectId="served-id" starClass="O" accentColor={0xffffff} rendererFactory={factory} /><button>Existing action</button></div>)
  await settle()
  const ready = async (index = 0) => {
    entries[index].init.resolve(); entries[index].submission.resolve()
    await settle(); await frame(100)
  }
  return { ...host, entries, factory, ready }
}

describe('game preview on the shared WebGPUCanvas', () => {
  it.each(['webgpu', 'webgl2'] as const)('uses the owner for %s and preserves production star identity, input and resolution cap', async backend => {
    const h = await mount(backend)
    expect(h.entries).toHaveLength(1)
    fireEvent.keyDown(h.getByTestId('spacecraft-preview-surface'), { key: 'ArrowRight' })
    await h.ready()
    expect(h.getByRole('img', { name: 'Selected star model' })).toHaveAttribute('data-renderer-backend', backend)
    expect(art.stars[0].options).toMatchObject({ objectId: 'served-id', starClass: 'O' })
    const model = art.stars[0].mesh as THREE.Mesh
    expect(model.rotation.y).toBeCloseTo(Math.PI / 12)
    expect(h.entries[0].options).toMatchObject({ alpha: true, stencil: false })
    for (const [width, height, ratio] of h.entries[0].resize.mock.calls) expect(Math.max(width, height) * ratio).toBeLessThanOrEqual(384)
    const dispose = vi.spyOn(model.geometry, 'dispose')
    h.unmount()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('falls back on first-frame rejection and recovers through the shared pinned renderer notice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const h = await mount()
    h.entries[0].init.resolve(); await settle(); await frame(100)
    h.entries[0].submission.reject(new Error('compile')); await settle()
    expect(h.entries).toHaveLength(2)
    expect(h.entries[1].options.forceWebGL).toBe(true)
    expect(h.entries[1].options.canvas).not.toBe(h.entries[0].options.canvas)
    await h.ready(1)
    act(() => h.entries[1].loss())
    expect(h.getByTestId('renderer-interrupted')).toHaveAttribute('data-surface', 'preview')
    expect(h.getByRole('button', { name: 'Existing action' })).toBeEnabled()
    fireEvent.click(h.getByTestId('renderer-retry'))
    fireEvent.click(h.getByTestId('renderer-retry'))
    expect(h.entries).toHaveLength(3)
    await h.ready(2)
    expect(h.queryByTestId('renderer-interrupted')).toBeNull()
    expect(art.stars).toHaveLength(1)
  })

  it('ignores initialization after unmount and releases actual scene resources', async () => {
    const h = await mount(), model = art.stars[0].mesh as THREE.Mesh
    const dispose = vi.spyOn(model.geometry, 'dispose')
    h.unmount(); h.entries[0].init.resolve(); await settle(); await frame(100)
    expect(h.entries[0].render).not.toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('caps animation, freezes reduced-motion decoration and still responds to explicit orientation changes', async () => {
    const h = await mount(); await h.ready()
    const star = art.stars[0]
    star.advance.mockClear()
    await frame(116)
    expect(star.advance).not.toHaveBeenCalled()
    await frame(140)
    expect(star.advance).toHaveBeenCalled()
    act(() => { motion.matches = true; motion.dispatchEvent(new Event('change')) })
    star.advance.mockClear(); await frame(180)
    const draws = h.entries[0].render.mock.calls.length
    fireEvent.keyDown(h.getByTestId('spacecraft-preview-surface'), { key: 'ArrowLeft' })
    await frame(220)
    expect(h.entries[0].render.mock.calls.length).toBeGreaterThan(draws)
    expect(star.advance).not.toHaveBeenCalled()
  })

  it('does not present a hidden reduced-motion preview until visibility returns', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    motion.matches = true
    const h = await mount(); await h.ready()
    expect(h.entries[0].render).not.toHaveBeenCalled()
    act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')) })
    await frame(200)
    expect(h.entries[0].render).toHaveBeenCalledTimes(1)
    expect(art.stars[0].advance).not.toHaveBeenCalled()
  })
})
