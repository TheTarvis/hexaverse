import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import SpaceWorld, { BODY_DRAW_SCALE } from './SpaceWorld'
import { defaultCamera, type SpaceCamera } from '../space-camera'
import { viewBasisOf } from '../space-projection'
import type { SceneMark, SceneModel } from '../space-scene'
import type { SpaceFrame } from '../space-transform-loop'

const capture = vi.hoisted(() => ({ scene: null as unknown, color: null as unknown, rendererOptions: null as unknown }))
vi.mock('@/components/render-guard/renderer-candidate', () => ({ createRendererCandidate: (options: { canvas: HTMLCanvasElement; forceWebGL: boolean }) => {
  capture.rendererOptions = options
  return { canvas: options.canvas, init: async () => {}, backend: () => options.forceWebGL ? 'webgl2' : 'webgpu',
    setClearColor: (color: unknown) => { capture.color = color }, resize() {},
    render: (scene: unknown) => { capture.scene = scene }, onLoss: () => () => {}, dispose() {} }
} }))
const settle = async () => { await act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }) }

let nextFrame: FrameRequestCallback
beforeEach(() => {
  capture.scene = null
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const mark = (id: string, type: string): SceneMark => ({ id, kind: 'body', bodyType: type, radius: 2, position: { x: 20, y: 1, z: 10 }, selected: false, pickable: true })
async function mount(marks: SceneMark[], actingFleetId?: string) {
  const camera = defaultCamera(100)
  const scene: SceneModel = { marks, curves: [], beltFields: [], orbitRings: [], positionTimeMs: 0, decorativeTimeMs: 0, omissions: [] }
  const frameRef: { current: SpaceFrame } = { current: { camera, scene, basis: viewBasisOf(camera, { width: 1200, height: 900 }), projected: new Map() } }
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({ createProgram: vi.fn() } as unknown as WebGLRenderingContext)
  const mounted = render(<SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} actingFleetId={actingFleetId} onFirstFrame={firstFrame} />)
  async function step(nextCamera: SpaceCamera = frameRef.current.camera) {
    frameRef.current = { ...frameRef.current, camera: nextCamera, basis: viewBasisOf(nextCamera, { width: 1200, height: 900 }) }
    nextFrame(1)
    await settle()
  }
  await settle()
  return { ...mounted, frameRef, step, scene, canvas }
}
function world() { expect(capture.scene).toBeInstanceOf(THREE.Scene); return capture.scene as THREE.Scene }
function bodies() { return world().children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh) }


const loading = vi.hoisted(() => ({ calls: [] as { url: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  loadAsync(url: string) { return new Promise((resolve, reject) => loading.calls.push({ url, resolve, reject })) }
  load(url: string, resolve: (value: unknown) => void, _progress: unknown, reject: (error: unknown) => void) { loading.calls.push({ url, resolve, reject }) }
} }))
const firstFrame = vi.fn()
beforeEach(() => { loading.calls = []; firstFrame.mockClear() })
const fleet = (id = 'own', mode: 0 | 1 | 2 = 1): SceneMark => ({ ...mark(id, ''), kind: 'fleet', fleetMode: mode })
function asset() {
  const group = new THREE.Group()
  const map = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255]), 1, 1)
  const material = new THREE.MeshStandardMaterial({ map, metalness: 0.8 })
  const geometry = new THREE.BoxGeometry(2, 1, 4)
  for (const x of [-1, 1]) { const mesh = new THREE.Mesh(geometry, material); mesh.position.x = x; group.add(mesh) }
  return group
}
function owned(root: THREE.Object3D) {
  const items = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    items.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      items.add(m)
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) items.add(value)
    }
  })
  return [...items]
}
function watch(root: THREE.Object3D) { return owned(root).map(r => vi.spyOn(r, 'dispose')) }
function mapped(root: THREE.Object3D) {
  const meshes: THREE.Mesh[] = []
  root.traverse(o => { if (o instanceof THREE.Mesh && (Array.isArray(o.material) ? o.material : [o.material]).some(m => (m instanceof THREE.MeshStandardMaterial || m instanceof MeshStandardNodeMaterial) && m.map)) meshes.push(o) })
  return meshes
}
async function resolve(index: number, scene = asset()) {
  expect(loading.calls[index], 'One local request for each eligible kind').toBeDefined()
  await act(async () => { loading.calls[index]!.resolve({ scene, animations: scene.animations }) })
  return scene
}
function rings() {
  const found: THREE.Mesh[] = []
  world().traverse(o => { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.RingGeometry && o.visible) found.push(o) })
  return found
}
describe('add-ship-station-models real scene integration', () => {
  it('Scenario: Pending asset and successful replacement', async () => {
    const selected = { ...mark('station', 'station'), selected: true }
    const h = await mount([fleet(), selected], 'own')
    expect(firstFrame).toHaveBeenCalledTimes(1)
    expect(bodies()).toHaveLength(2)
    expect(loading.calls.map(c => c.url).sort()).toEqual(['/models/space/orbital-station.glb', '/models/space/utility-ship.glb'])
    const previous = bodies(), dispose = previous.flatMap(watch)
    h.scene.marks = [{ ...fleet(), position: { x: 71, y: 3, z: -4 } }, { ...selected, position: { x: -3, y: 8, z: 6 } }]
    await h.step()
    await resolve(0); await resolve(1); await h.step()
    expect(bodies()).toHaveLength(2)
    bodies().forEach((mesh, i) => {
      expect(mesh).not.toBe(previous[i]); expect(mapped(mesh)).toHaveLength(2)
      expect(mesh.position.toArray()).toEqual(Object.values(h.scene.marks[i]!.position))
      expect(mesh.scale.x).toBe(2 * BODY_DRAW_SCALE)
    })
    for (const spy of dispose) expect(spy).toHaveBeenCalledTimes(1)
    expect(rings()).toHaveLength(1)
    expect(firstFrame).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Missing or invalid asset', async () => {
    const h = await mount([fleet()])
    expect(loading.calls).toHaveLength(1)
    const fallback = bodies()[0]
    await act(async () => { loading.calls[0]!.reject(new Error('decode failed')) })
    await h.step(); expect(bodies()[0]).toBe(fallback)
    h.scene.marks = [fleet('own', 0)]; await h.step()
    h.scene.marks = []; await h.step()
    h.scene.marks = [fleet()]; await h.step()
    expect(loading.calls).toHaveLength(1)
    expect(bodies()).toHaveLength(1)
    expect(firstFrame).toHaveBeenCalledTimes(1)
  })
  it.each(['removed', 'retyped', 'reinserted', 'unmounted'] as const)('Scenario: Stale completion cannot restore a model — %s', async action => {
    const h = await mount([mark('same', 'station')])
    expect(loading.calls).toHaveLength(1)
    if (action === 'unmounted') h.unmount()
    else {
      h.scene.marks = action === 'retyped' ? [mark('same', 'rocky')] : []
      await h.step()
      if (action === 'reinserted') { h.scene.marks = [mark('same', 'station')]; await h.step() }
    }
    const source = asset(), disposal = watch(source)
    await resolve(0, source)
    if (action === 'unmounted') { for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1) }
    else {
      await h.step()
      expect(bodies()).toHaveLength(action === 'removed' ? 0 : 1)
      if (action === 'reinserted') expect(mapped(bodies()[0]!)).toHaveLength(2)
      if (action === 'retyped') expect(mapped(bodies()[0]!)).toHaveLength(1) // rocky surface only
      for (const spy of disposal) expect(spy).not.toHaveBeenCalled()
      h.unmount(); for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1)
    }
  })
  it('Scenario: Anonymous contact remains abstract', async () => {
    const contact: SceneMark = { ...mark('contact', 'station'), kind: 'contact' }
    const h = await mount([fleet(), contact, { ...contact, id: 'sighting', kind: 'sighting' }, { ...contact, id: 'preview', kind: 'ghost' }])
    expect(loading.calls).toHaveLength(1)
    expect(loading.calls[0]!.url).toContain('utility-ship')
    const abstract = bodies().slice(1)
    expect(abstract[0]!.geometry).toBeInstanceOf(THREE.SphereGeometry)
    await resolve(0); h.scene.positionTimeMs = 1000; await h.step()
    expect(bodies().slice(1)).toEqual(abstract)
    for (const mesh of abstract) expect(mapped(mesh)).toHaveLength(0)
    expect(abstract[0]!.position.toArray()).toEqual([20, 1, 10])
  })
  it('Scenario: Fleet mode changes', async () => {
    const h = await mount([fleet('own', 0)])
    await resolve(0); await h.step()
    for (const [mode, color] of [[0, 0xffb454], [1, 0x4ade80], [2, 0xc4b5fd]] as const) {
      h.scene.marks = [fleet('own', mode)]; await h.step()
      const root = bodies()[0]!
      expect(mapped(root)).toHaveLength(2)
      let visibleAccent = false
      root.traverseVisible(o => {
        if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('position')?.count) return
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if ('color' in m && (m.color as THREE.Color).getHex() === color) visibleAccent = true
      })
      expect(visibleAccent).toBe(true)
    }
    expect(loading.calls).toHaveLength(1)
  })
  it('Scenario: Station classification changes', async () => {
    const h = await mount([mark('same', 'station'), { ...mark('gate', 'gate'), kind: 'gate' }])
    await resolve(0); await h.step()
    const station = bodies()[0]!, gate = bodies()[1]!, disposed = watch(station)
    h.scene.marks = [mark('same', 'rocky'), { ...mark('gate', 'gate'), kind: 'gate' }]; await h.step()
    expect(bodies()[0]).not.toBe(station); expect(bodies()[1]).toBe(gate)
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
    h.scene.marks = [mark('same', 'station')]; await h.step()
    expect(mapped(bodies()[0]!)).toHaveLength(2)
    expect(loading.calls).toHaveLength(2) // Station and gate each load once.
  })
  it('Selection ring is exclusive while acting fleet positions still advance', async () => {
    const h = await mount([fleet(), { ...mark('station', 'station'), selected: true }], 'own')
    await resolve(0); await resolve(1); await h.step()
    const camera = JSON.stringify(h.frameRef.current.camera)
    h.scene.marks = [{ ...fleet(), position: { x: 4, y: 9, z: 2 } }, { ...mark('station', 'station'), selected: true, position: { x: -4, y: 0, z: 11 } }]
    await h.step()
    expect(JSON.stringify(h.frameRef.current.camera)).toBe(camera)
    const visibleRings = rings()
    expect(visibleRings).toHaveLength(1)
    expect((visibleRings[0]!.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x67e8f9)
    expect(visibleRings[0]!.position.toArray()).toEqual([-4, 0, 11])
    h.scene.marks = h.scene.marks.map(mark => ({ ...mark, selected: false }))
    await h.step()
    expect(rings()).toHaveLength(1)
    expect((rings()[0]!.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x4ade80)
    expect(bodies().map(m => m.position.toArray())).toEqual([[4, 9, 2], [-4, 0, 11]])
  })
  it('Scenario: Repeated frames and multiple marks / Withdrawal and empty scene', async () => {
    const h = await mount([fleet('one'), fleet('two'), mark('station', 'station')])
    expect(loading.calls).toHaveLength(2)
    await resolve(0); await resolve(1); await h.step()
    const models = bodies(), identity = models.map(owned)
    for (let n = 0; n < 10; n++) await h.step()
    expect(bodies()).toEqual(models); expect(bodies().map(owned)).toEqual(identity)
    expect(loading.calls).toHaveLength(2)
    const disposal = models.flatMap(watch)
    h.scene.marks = []; await h.step()
    expect(bodies()).toHaveLength(0)
    for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1)
    h.unmount(); for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Replacement removal and remount', async () => {
    const h = await mount([fleet('one'), fleet('two')])
    const source = await resolve(0); await h.step()
    const originals = watch(source), [one, two] = bodies(), first = watch(one!), second = watch(two!)
    h.scene.marks = [fleet('two')]; await h.step()
    for (const spy of first) expect(spy).toHaveBeenCalledTimes(1)
    for (const spy of [...second, ...originals]) expect(spy).not.toHaveBeenCalled()
    expect(bodies()[0]).toBe(two)
    h.unmount()
    for (const spy of [...first, ...second, ...originals]) expect(spy).toHaveBeenCalledTimes(1)
    await mount([fleet('two')]); expect(loading.calls).toHaveLength(2)
    await resolve(1)
  })
  it('Scenario: Renderer recovery and reduced motion', async () => {
    const h = await mount([fleet()])
    await resolve(0); await h.step()
    const root = bodies()[0]!, disposal = watch(root)
    const children = root.children.map(c => c.matrix.toArray())
    h.scene.decorativeTimeMs = 0
    h.scene.positionTimeMs = 2000
    h.scene.marks = [{ ...fleet(), position: { x: 100, y: 2, z: 3 } }]; await h.step()
    expect(root.position.toArray()).toEqual([100, 2, 3])
    expect(root.children.map(c => c.matrix.toArray())).toEqual(children)
    h.unmount(); for (const spy of disposal) expect(spy).toHaveBeenCalledTimes(1)
    await mount([fleet()]); expect(loading.calls).toHaveLength(2)
    await resolve(1)
  })
  it('SDET-added: opaque imported children mask hexes and transparent accents do not write depth', async () => {
    const h = await mount([fleet(), mark('station', 'station')])
    await resolve(0); await resolve(1); await h.step()
    for (const root of bodies()) root.traverseVisible(o => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('position')?.count) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.transparent) expect(m.depthWrite).toBe(false)
        else { expect(m.stencilWrite).toBe(true); expect(m.stencilRef).toBe(1); expect(m.stencilZPass).toBe(THREE.ReplaceStencilOp) }
      }
    })
  })
})

// Post-handoff amendment authorized by orchestrator: the existing invalid-load
// test rejected transport/decode promises, but a successfully decoded empty GLTF
// must also retain fallback across later appearance invalidation.
it.each(['ship', 'station'] as const)('Scenario: Missing or invalid asset — decoded unusable %s survives appearance changes', async kind => {
  const original = kind === 'ship' ? fleet() : mark('station', 'station')
  const h = await mount([original])
  const unusable = new THREE.Group()
  unusable.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()))
  const sourceDisposed = watch(unusable)
  await resolve(0, unusable)
  await h.step()
  expect(bodies()).toHaveLength(1)
  h.scene.marks = [kind === 'ship' ? fleet('own', 0) : mark('station', 'rocky')]
  await expect(h.step()).resolves.toBeUndefined()
  h.scene.marks = []; await h.step()
  h.scene.marks = [original]
  await expect(h.step()).resolves.toBeUndefined()
  expect(bodies()).toHaveLength(1)
  expect(loading.calls).toHaveLength(1)
  h.unmount()
  for (const spy of sourceDisposed) expect(spy).toHaveBeenCalledTimes(1)
})


describe('lane gate world integration', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
  })
  const gate = (id: string): SceneMark => ({ ...mark(id, 'gate'), kind: 'gate', selected: id === 'one' })
  function gateAsset() {
    const source = asset()
    source.children[0]!.name = 'LeftHalf'
    source.children[1]!.name = 'RightHalf'
    source.animations = [new THREE.AnimationClip('Open', 1, [
      new THREE.VectorKeyframeTrack('LeftHalf.position', [0, 1], [-1, 0, 0, -3, 0, 0]),
      new THREE.VectorKeyframeTrack('RightHalf.position', [0, 1], [1, 0, 0, 3, 0, 0]),
    ])]
    return source
  }
  it('opens hardware and field once per instance, preserves picking scale, freezes decorative time, and owns resources', async () => {
    const h = await mount([gate('one'), gate('two')])
    expect(loading.calls.map(call => call.url)).toEqual(['/models/space/lane-gate.glb'])
    const source = await resolve(0, gateAsset())
    const originals = watch(source)
    await h.step()
    const [one, two] = bodies()
    expect(bodies()).toHaveLength(2)
    expect(one!.scale.x).toBe(2 * BODY_DRAW_SCALE)
    expect(rings()).toHaveLength(1)
    expect(one!.getObjectByName('LeftHalf')!.position.x).toBe(-3)
    expect(one!.getObjectByName('RightHalf')!.position.x).toBe(3)
    expect(source.getObjectByName('LeftHalf')!.position.x).toBe(-1)
    const portal = one!.getObjectByName('LaneGatePortal')!
    expect(portal.visible).toBe(true)
    const filament = portal.children.find(child => child instanceof THREE.Line) as THREE.Line
    const vertices = () => Array.from(filament.geometry.getAttribute('position').array)
    const initial = vertices()
    h.scene.decorativeTimeMs = 1000
    await h.step()
    expect(vertices()).not.toEqual(initial)
    const frozen = vertices()
    h.scene.positionTimeMs = 2000
    h.scene.marks = [{ ...gate('one'), position: { x: 70, y: 2, z: -4 } }, gate('two')]
    await h.step()
    expect(vertices()).toEqual(frozen)
    expect(one!.position.toArray()).toEqual([70, 2, -4])
    const first = watch(one!), second = watch(two!)
    const fieldResources = portal.children.filter(child => child instanceof THREE.Line).flatMap(child => [
      vi.spyOn((child as THREE.Line).geometry, 'dispose'),
      vi.spyOn((child as THREE.Line).material as THREE.Material, 'dispose'),
    ])
    h.scene.marks = [gate('two')]
    await h.step()
    for (const spy of [...first, ...fieldResources]) expect(spy).toHaveBeenCalledTimes(1)
    for (const spy of [...second, ...originals]) expect(spy).not.toHaveBeenCalled()
    h.unmount()
    for (const spy of [...first, ...second, ...originals, ...fieldResources]) expect(spy).toHaveBeenCalledTimes(1)
  })
  it.each(['removed', 'unmounted'] as const)('ignores stale gate completion after %s', async action => {
    const h = await mount([gate('one')])
    if (action === 'unmounted') h.unmount()
    else { h.scene.marks = []; await h.step() }
    const source = gateAsset(), disposed = watch(source)
    await resolve(0, source)
    if (action === 'removed') { await h.step(); expect(bodies()).toHaveLength(0); h.unmount() }
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
  })
  it('retains the fallback and caches a failed gate load', async () => {
    const h = await mount([gate('one')])
    const fallback = bodies()[0]
    await act(async () => loading.calls[0]!.reject(new Error('missing gate')))
    await h.step()
    expect(bodies()[0]).toBe(fallback)
    h.scene.marks = []; await h.step()
    h.scene.marks = [gate('one')]; await h.step()
    expect(loading.calls).toHaveLength(1)
  })
})
