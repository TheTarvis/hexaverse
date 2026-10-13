import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { SpaceCanvas } from '../SpaceCanvas'
import { SpaceWorld } from './SpaceWorld'
import { defaultCamera } from '../space-camera'
import { viewBasisOf } from '../space-projection'
import type { SpaceFrame } from '../space-transform-loop'
import type { RendererCandidateOptions } from '@/components/render-guard/renderer-candidate'
import type { RendererOwner } from '@/components/render-guard/renderer-owner'

function deferred() { let resolve!: () => void; let reject!: (reason: unknown) => void; const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const settle = async () => { await act(async () => { for (let n = 0; n < 20; n++) await Promise.resolve() }) }
let frame: FrameRequestCallback
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frame = callback; return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount(backend: 'webgpu' | 'webgl2' = 'webgpu') {
  const entries: { options: RendererCandidateOptions; init: ReturnType<typeof deferred>; submission: ReturnType<typeof deferred>; render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; loss: (info: { message?: string }) => void }[] = []
  const factory = vi.fn((options: RendererCandidateOptions) => {
    const entry = { options, init: deferred(), submission: deferred(), render: vi.fn(), dispose: vi.fn(), loss: (_info: { message?: string }) => {} }
    entry.render.mockImplementation(() => entry.submission.promise); entries.push(entry)
    return { canvas: options.canvas, init: () => entry.init.promise, backend: () => options.forceWebGL ? 'webgl2' as const : backend,
      render: entry.render, dispose: entry.dispose, resize: vi.fn(), setClearColor: vi.fn(), onLoss: (listener: typeof entry.loss) => { entry.loss = listener; return vi.fn() } }
  })
  const camera = defaultCamera(100)
  const frameRef: { current: SpaceFrame } = { current: { camera, scene: { marks: [{ id: 'served', kind: 'star', starClass: 'G', position: { x: 2, y: 0, z: 0 }, radius: 2, selected: false, pickable: true }], curves: [], beltFields: [], orbitRings: [], omissions: [], positionTimeMs: 0, decorativeTimeMs: 0 }, basis: viewBasisOf(camera, { width: 320, height: 200 }), projected: new Map() } }
  const onFirstFrame = vi.fn(), available = vi.fn()
  let owner: RendererOwner | null = null
  const host = render(<SpaceCanvas rendererFactory={factory} onAvailabilityChange={available} renderWorld={(canvas, bindings) => <SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} {...bindings} onRendererOwner={value => { owner = value; bindings.onRendererOwner(value) }} onFirstFrame={onFirstFrame} />}><button data-testid="map-input">Pick</button></SpaceCanvas>)
  return { ...host, entries, frameRef, factory, onFirstFrame, available, owner: () => owner }
}
describe('actual system canvas owner wiring', () => {
  it.each(['webgpu', 'webgl2'] as const)('Scenario: Every owner presents through WebGPU / Missing WebGPU uses compatibility rendering — map %s', async backend => {
    const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    const h = mount(backend); await settle(); expect(h.entries).toHaveLength(1)
    expect(context).not.toHaveBeenCalled()
    expect(h.onFirstFrame).not.toHaveBeenCalled(); expect(h.queryByTestId('map-input')).toBeNull()
    h.entries[0]!.init.resolve(); await settle(); await act(async () => frame(40)); await settle()
    expect(h.entries[0]!.render).toHaveBeenCalled()
    expect(h.onFirstFrame).not.toHaveBeenCalled()
    h.entries[0]!.submission.resolve(); await settle()
    expect(h.onFirstFrame).toHaveBeenCalledTimes(1)
    expect(h.getByTestId('space-canvas')).toHaveAttribute('data-renderer-backend', backend)
    expect(h.getByTestId('space-canvas')).toHaveAttribute('data-renderer-ready', 'true')
    expect(h.getByTestId('map-input')).toBeEnabled(); expect(h.available).toHaveBeenLastCalledWith(true)
    h.unmount(); expect(h.entries[0]!.dispose).toHaveBeenCalled()
  })
  it('Scenario: Primary first-frame rejection tries compatibility — map host swaps fresh canvas without remounting owner', async () => {
    const h = mount(); await settle(); h.entries[0]!.init.resolve(); await settle(); await act(async () => frame(40))
    const firstCanvas = h.entries[0]!.options.canvas
    h.entries[0]!.submission.reject(new Error('shader compilation')); await settle()
    expect(h.entries).toHaveLength(2); expect(h.entries[1]!.options.forceWebGL).toBe(true)
    expect(h.entries[0]!.dispose).toHaveBeenCalled(); expect(h.entries[1]!.options.canvas).not.toBe(firstCanvas)
    h.entries[1]!.init.resolve(); h.entries[1]!.submission.resolve(); await settle(); await act(async () => frame(80)); await settle()
    expect(h.onFirstFrame).toHaveBeenCalledTimes(1); expect(h.entries).toHaveLength(2)
  })
  it('Scenario: A restored context\'s first frame reflects live state, not a stale one / WebGPU device loss requires explicit recreation', async () => {
    const h = mount(); await settle(); h.entries[0]!.init.resolve(); h.entries[0]!.submission.resolve(); await settle(); await act(async () => frame(40)); await settle()
    act(() => h.entries[0]!.loss({ message: 'lost' })); await settle()
    expect(h.getByTestId('renderer-interrupted')).toBeInTheDocument(); expect(h.entries).toHaveLength(1)
    h.frameRef.current.scene.marks[0]!.position = { x: 99, y: 4, z: 1 }
    act(() => { h.owner()!.retry(); h.owner()!.retry() }); expect(h.entries).toHaveLength(2)
    h.entries[1]!.init.resolve(); h.entries[1]!.submission.resolve(); await settle(); await act(async () => frame(80)); await settle()
    const scene = h.entries[1]!.render.mock.calls.at(-1)![0] as THREE.Scene
    expect(scene.children.some(object => object instanceof THREE.Mesh && object.position.equals(new THREE.Vector3(99, 4, 1)))).toBe(true)
    expect(h.queryByTestId('renderer-interrupted')).toBeNull()
  })
  it('Scenario: Route replacement ignores stale completion — actual map unmount', async () => {
    const h = mount(); await settle(); h.unmount(); h.entries[0]!.init.resolve(); await settle()
    expect(h.entries[0]!.render).not.toHaveBeenCalled(); expect(h.onFirstFrame).not.toHaveBeenCalled(); expect(h.entries[0]!.dispose).toHaveBeenCalled()
  })
})


it('Scenario: Reduced motion freezes decoration without freezing state — map advances the shared star family only while eligible', async () => {
  const art = await import('./star-art')
  const create = vi.spyOn(art, 'createStarModel')
  let now = 100
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const preference = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => preference)
  const h = mount(); await settle(); h.entries[0]!.init.resolve(); h.entries[0]!.submission.resolve(); await settle(); await act(async () => frame(now)); await settle()
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ objectId: 'served', starClass: 'G' }))
  const model = create.mock.results[0]!.value as ReturnType<typeof art.createStarModel>
  const advance = vi.spyOn(model, 'advance')
  now += 40; await act(async () => frame(now)); await settle()
  expect(advance).toHaveBeenCalled()
  preference.matches = true; preference.dispatchEvent(new Event('change')); advance.mockClear()
  h.frameRef.current.scene.marks[0]!.position = { x: 77, y: 0, z: 0 }
  now += 40; await act(async () => frame(now)); await settle()
  expect(advance).not.toHaveBeenCalled(); expect(model.mesh.position.x).toBe(77)
})
