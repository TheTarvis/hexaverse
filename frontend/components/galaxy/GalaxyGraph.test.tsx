import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, act, fireEvent } from '@testing-library/react'
import * as THREE from 'three'
import { deferred, rendererHarness, installPresentationEnvironment, frames } from './renderer-test-harness'
import type { Galaxy, GalaxyNode } from '@/lib/types/galaxy'

const seam = vi.hoisted(() => ({ factory: vi.fn() }))
vi.mock('@/components/render-guard/renderer-candidate', () => ({ createRendererCandidate: seam.factory }))
// The retired renderer must never be reached; keeping this stub makes old code
// fail on candidate assertions instead of jsdom's missing WebGL implementation.
vi.mock('react-force-graph-3d', () => ({ default: () => null }))
import { GalaxyGraph } from './GalaxyGraph'
import { CameraRig } from './camera-rig'

const nodeA: GalaxyNode = { id: 'a', name: '<img src=x onerror=alert(1)>', region: 'star_rich', tier: 'explored', skeleton: { starClass: 'G', bodies: [] }, x: -40, y: 0, z: 0, fx: -40, fy: 0, fz: 0 }
const nodeB: GalaxyNode = { ...nodeA, id: 'b', name: 'Borealis', region: 'barrier', tier: 'starVisible', x: 40, fx: 40 }
const galaxy: Galaxy = { id: 'g', seed: 1, bounds: { x: [-60, 60], y: [-60, 60], z: [-10, 10] }, worldTime: 0, nodes: [nodeA, nodeB], links: [{ id: 'l', source: 'a', target: 'b', bridge: false }] }

function clickAt(canvas: HTMLCanvasElement, x: number, y: number, drag = 0) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: x, clientY: y })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: x + drag, clientY: y })
  fireEvent.click(canvas, { button: 0, clientX: x + drag, clientY: y })
}

describe('GalaxyGraph owned renderer', () => {
  let gpu: ReturnType<typeof rendererHarness>
  beforeEach(() => {
    installPresentationEnvironment()
    gpu = rendererHarness()
    seam.factory.mockImplementation(gpu.factory)
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it.each(['webgpu', 'webgl2'] as const)('Scenario: Every owner presents through WebGPU — galaxy %s readiness follows submitted frame', async (backend) => {
    const init = deferred(), frame = deferred(), onReady = vi.fn()
    gpu.plans.push({ init, frame, backend })
    const view = render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={vi.fn()} onReady={onReady} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    expect(onReady).not.toHaveBeenCalled()
    expect(gpu.candidates[0].render).not.toHaveBeenCalled()
    await act(async () => init.resolve())
    await frames()
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(1)
    expect(onReady).not.toHaveBeenCalled()
    await act(async () => frame.resolve())
    await frames()
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onReady.mock.calls[0][0].canvas()).toBe(gpu.candidates[0].canvas)
    expect(gpu.candidates[0].canvas).toHaveAttribute('data-renderer-backend', backend)
    expect(gpu.candidates[0].canvas).toHaveAttribute('data-renderer-ready', 'true')
    view.unmount()
    expect(gpu.candidates[0].dispose).toHaveBeenCalled()
    const draws = gpu.candidates[0].render.mock.calls.length
    await frames()
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(draws)
  })

  it('Scenario: Primary first-frame rejection tries compatibility — fresh canvas keeps current graph', async () => {
    const frame = deferred()
    gpu.plans.push({ frame })
    const onReady = vi.fn()
    const view = render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={vi.fn()} onReady={onReady} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    const latest = { ...galaxy, nodes: [nodeA] , links: [] }
    view.rerender(<GalaxyGraph galaxy={latest} selectedId="a" onSelect={vi.fn()} onReady={onReady} />)
    await act(async () => frame.reject(new Error('first frame failed')))
    await frames()
    expect(gpu.candidates).toHaveLength(2)
    expect(gpu.candidates[1].canvas).not.toBe(gpu.candidates[0].canvas)
    expect(gpu.candidates[1].forceWebGL).toBe(true)
    expect(gpu.candidates[0].dispose).toHaveBeenCalled()
    expect(onReady).toHaveBeenCalledTimes(1)
    const [scene] = gpu.candidates[1].render.mock.calls.at(-1)!
    const sprites: THREE.Sprite[] = []
    scene.traverse(object => { if (object instanceof THREE.Sprite) sprites.push(object) })
    expect(sprites.some(sprite => sprite.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(nodeA.x, nodeA.y, nodeA.z)) < 0.01)).toBe(true)
    expect(sprites.some(sprite => sprite.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(nodeB.x, nodeB.y, nodeB.z)) < 0.01)).toBe(false)
  })

  it('Scenario: Galaxy graph preserves visual and input behavior — real node positions, selection toggle, background and drag suppression', async () => {
    const onSelect = vi.fn()
    const view = render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={onSelect} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    const candidate = gpu.candidates[0]
    const [scene, camera] = candidate.render.mock.calls.at(-1)!
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const projected = new THREE.Vector3(nodeA.x, nodeA.y, nodeA.z).project(camera)
    const x = (projected.x + 1) * 400, y = (1 - projected.y) * 300
    clickAt(candidate.canvas, x, y)
    expect(onSelect).toHaveBeenLastCalledWith(nodeA)
    view.rerender(<GalaxyGraph galaxy={galaxy} selectedId="a" onSelect={onSelect} />)
    await frames(22)
    clickAt(candidate.canvas, x, y)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    onSelect.mockClear()
    clickAt(candidate.canvas, x, y, 40)
    expect(onSelect).not.toHaveBeenCalled()
    clickAt(candidate.canvas, 2, 2)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    // Lanes remain decoration: a click on the lane midpoint clears selection.
    const midpoint = new THREE.Vector3(0, 0, 0).project(camera)
    clickAt(candidate.canvas, (midpoint.x + 1) * 400, (1 - midpoint.y) * 300)
    expect(onSelect).toHaveBeenLastCalledWith(null)
    fireEvent.pointerMove(candidate.canvas, { clientX: x, clientY: y })
    expect(view.container.querySelector('img')).toBeNull()
  })
  it('Scenario: WebGPU device loss requires explicit recreation — latest graph resumes and stale canvas is retired', async () => {
    const onRendererState = vi.fn(), onController = vi.fn(), onReady = vi.fn()
    const callbacks = { onRendererState, onController, onReady }
    const view = render(<GalaxyGraph {...callbacks} galaxy={galaxy} selectedId="a" onSelect={vi.fn()} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    await act(async () => gpu.candidates[0].lose())
    await frames()
    expect(onRendererState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'interrupted', backend: 'webgpu' }))
    const draws = gpu.candidates[0].render.mock.calls.length
    await frames(20)
    expect(gpu.candidates).toHaveLength(1)
    expect(gpu.candidates[0].render).toHaveBeenCalledTimes(draws)
    const newer = { ...galaxy, nodes: [{ ...nodeA, x: -75, fx: -75 }], links: [] }
    view.rerender(<GalaxyGraph {...callbacks} galaxy={newer} selectedId="a" onSelect={vi.fn()} />)
    await act(async () => onController.mock.calls.at(-1)![0].retry())
    await frames()
    expect(gpu.candidates).toHaveLength(2)
    expect(gpu.candidates[0].dispose).toHaveBeenCalled()
    expect(gpu.candidates[1].canvas).not.toBe(gpu.candidates[0].canvas)
    const [scene] = gpu.candidates[1].render.mock.calls.at(-1)!
    const sprites: THREE.Sprite[] = []
    scene.traverse(object => { if (object instanceof THREE.Sprite) sprites.push(object) })
    expect(sprites.some(sprite => sprite.getWorldPosition(new THREE.Vector3()).distanceTo(new THREE.Vector3(-75, 0, 0)) < 0.01)).toBe(true)
    expect(onRendererState).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready' }))
  })

  it('Scenario: Route replacement ignores stale completion — unmounted galaxy never announces ready', async () => {
    const init = deferred(), onReady = vi.fn()
    gpu.plans.push({ init })
    const view = render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={vi.fn()} onReady={onReady} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    view.unmount()
    await act(async () => init.resolve())
    await frames()
    expect(onReady).not.toHaveBeenCalled()
    expect(gpu.candidates[0].render).not.toHaveBeenCalled()
    expect(gpu.candidates[0].dispose).toHaveBeenCalled()
  })

  it('Scenario: Galaxy graph preserves visual and input behavior — double-click focuses with the 600ms glide', async () => {
    const focus = vi.spyOn(CameraRig.prototype, 'focus')
    const onSelect = vi.fn()
    render(<GalaxyGraph galaxy={galaxy} selectedId={null} onSelect={onSelect} />)
    await frames()
    expect(gpu.candidates).toHaveLength(1)
    const candidate = gpu.candidates[0]
    const [scene, camera] = candidate.render.mock.calls.at(-1)!
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const point = new THREE.Vector3(nodeA.x, nodeA.y, nodeA.z).project(camera)
    const x = (point.x + 1) * 400, y = (1 - point.y) * 300
    clickAt(candidate.canvas, x, y)
    await frames(20) // 340ms, just inside the 350ms double-click window.
    clickAt(candidate.canvas, x, y)
    expect(focus).toHaveBeenLastCalledWith(nodeA, 600, 240)
    expect(onSelect).toHaveBeenLastCalledWith(nodeA)
  })

})
