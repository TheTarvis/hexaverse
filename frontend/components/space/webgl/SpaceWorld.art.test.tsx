import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { Line2 } from 'three/examples/jsm/lines/webgpu/Line2.js'
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
async function mount(marks: SceneMark[], beltFields: SceneModel['beltFields'] = []) {
  const camera = defaultCamera(100)
  const scene: SceneModel = { marks, curves: [], beltFields, orbitRings: [], positionTimeMs: 0, decorativeTimeMs: 0, omissions: [] }
  const frameRef: { current: SpaceFrame } = { current: { camera, scene, basis: viewBasisOf(camera, { width: 1200, height: 900 }), projected: new Map() } }
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({ createProgram: vi.fn() } as unknown as WebGLRenderingContext)
  const mounted = render(<SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} />)
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
function surface(mesh: THREE.Mesh) { return mesh.material as THREE.MeshStandardMaterial }
function grid() {
  const objects: THREE.LineSegments[] = []
  world().traverse((o) => { if (o instanceof THREE.LineSegments) objects.push(o) })
  expect(objects).toHaveLength(1)
  return objects[0]!
}

describe('refresh-system-scene-art actual Three scene integration', () => {
  it('Scenario: Rocky surface and rim', async () => {
    await mount([mark('rock', 'rocky'), mark('gas', 'gas_giant')])
    const [rock, gas] = bodies()
    for (const mesh of [rock!, gas!]) {
      expect(surface(mesh) instanceof THREE.MeshStandardMaterial || surface(mesh) instanceof MeshStandardNodeMaterial).toBe(true)
      expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
      expect(surface(mesh).color.getHex()).toBe(0xffffff)
    }
    expect(rock!.children.length).toBeGreaterThan(0)
    for (const child of rock!.children) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) expect((child.material as THREE.Material).depthWrite).toBe(false)
    }
  })
  it('Scenario: Repeatable and refreshed classification', async () => {
    const h = await mount([mark('same', 'rocky')])
    const old = bodies()[0]!
    const map = surface(old).map!
    expect(map).toBeInstanceOf(THREE.DataTexture)
    const release = vi.spyOn(map, 'dispose')
    await h.step()
    expect(bodies()[0]).toBe(old)
    expect(surface(old).map).toBe(map)
    h.scene.marks = [mark('same', 'gas_giant')]
    await h.step()
    expect(surface(bodies()[0]!).map).not.toBe(map)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Other body types and missing features', async () => {
    const h = await mount([mark('ice', 'ice'), mark('moon', 'moon'), mark('unknown', 'not-a-type')])
    expect(bodies()).toHaveLength(3)
    expect(surface(bodies()[0]!).map).toBeInstanceOf(THREE.DataTexture)
    expect(surface(bodies()[1]!).map).toBeInstanceOf(THREE.DataTexture)
    expect(surface(bodies()[2]!).map).toBeNull()
    h.scene.marks = []
    await h.step()
    expect(bodies()).toHaveLength(0)
  })
  it.each([['belt', 0x8a8d99]] as const)('Scenario: Other body types and missing features — preserves %s fallback', async (type, tint) => {
    await mount([mark('fallback', type)])
    const material = surface(bodies()[0]!)
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.map).toBeNull()
    expect(material.color.getHex()).toBe(tint)
  })
  it('Scenario: Warm reference star / Cool spectral classes remain distinct / Glow follows camera changes', async () => {
    const star: SceneMark = { ...mark('sun', ''), kind: 'star', starClass: 'G' }
    const h = await mount([star])
    const warm = bodies()[0]!
    const sprites = warm.children.filter((o): o is THREE.Sprite | THREE.Mesh => o instanceof THREE.Sprite || o instanceof THREE.Mesh)
    expect(sprites.length).toBeGreaterThan(0)
    expect((sprites[0]!.material as THREE.Material & { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true)
    expect(sprites[0]!.position.length()).toBe(0)
    const tint = (warm.material as THREE.MeshBasicMaterial).color.clone()
    expect(tint.r).toBeGreaterThan(tint.b)
    await h.step({ ...h.frameRef.current.camera, yaw: 1.4 })
    expect(bodies()[0]).toBe(warm)
    h.scene.marks = [{ ...star, starClass: 'O' }]
    await h.step()
    const cool = (bodies()[0]!.material as THREE.MeshBasicMaterial).color
    expect(cool.b).toBeGreaterThan(cool.r)
    expect(cool.equals(tint)).toBe(false)
    expect(bodies()).toHaveLength(1)
  })
  it('Scenario: Planar depth reference — grid rejects pixels stamped by opaque body silhouettes', async () => {
    const h = await mount([mark('solid', 'rocky'), mark('translucent', 'unknown')])
    // Context attributes are fixed at first getContext: renderer options alone
    // cannot reserve stencil after a probe already created a stencil-less context.
    expect(h.canvas.getContext).not.toHaveBeenCalled()
    expect(capture.rendererOptions).toEqual(expect.objectContaining({ stencil: true }))
    const [solid, translucent] = bodies()
    const bodyMaterial = surface(solid!)
    const gridMaterial = grid().material as THREE.LineBasicMaterial
    expect(bodyMaterial.transparent).toBe(false)
    expect(bodyMaterial.stencilWrite).toBe(true)
    expect(bodyMaterial.stencilZPass).toBe(THREE.ReplaceStencilOp)
    expect(gridMaterial.transparent).toBe(true) // Draw after opaque bodies.
    expect(gridMaterial.stencilWrite).toBe(true)
    // Cleared background passes; opaque silhouettes fail. Different references
    // also force a native stencil-reference update on every body→grid pass.
    const passesStencil = (stored: number) => {
      if (gridMaterial.stencilFunc === THREE.EqualStencilFunc) return stored === gridMaterial.stencilRef
      if (gridMaterial.stencilFunc === THREE.NotEqualStencilFunc) return stored !== gridMaterial.stencilRef
      throw new Error('Grid mask must compare the opaque silhouette stamp')
    }
    expect(passesStencil(0)).toBe(true)
    expect(passesStencil(bodyMaterial.stencilRef)).toBe(false)
    expect(gridMaterial.stencilRef).not.toBe(bodyMaterial.stencilRef)
    expect(surface(translucent!).stencilWrite).toBe(false)
  })
  it('Scenario: Zoom and angle fade', async () => {
    const h = await mount([mark('body', 'rocky')])
    const lines = grid()
    const material = lines.material as THREE.LineBasicMaterial
    const initial = material.opacity
    expect(initial).toBeGreaterThan(0)
    await h.step({ ...h.frameRef.current.camera, distance: 600 })
    expect(material.opacity).toBeLessThan(initial)
    await h.step({ ...h.frameRef.current.camera, distance: 45, pitch: 0.001 })
    expect(material.opacity).toBeLessThan(initial)
    expect(material.opacity).toBeGreaterThanOrEqual(0)
    expect(grid()).toBe(lines)
  })
  it('Scenario: Selection and realtime refresh', async () => {
    const original = mark('body', 'rocky')
    const h = await mount([original])
    const snapshot = JSON.stringify(h.frameRef.current)
    const mesh = bodies()[0]!
    expect(mesh.position.toArray()).toEqual([20, 1, 10])
    expect(mesh.scale.x).toBe(2 * BODY_DRAW_SCALE)
    expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
    await h.step()
    expect(JSON.stringify(h.frameRef.current)).toBe(snapshot)
    expect(bodies()).toHaveLength(1)
  })
  it('Scenario: Scene removal and remount', async () => {
    const h = await mount([mark('rock', 'rocky')])
    const mesh = bodies()[0]!
    expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
    const texture = surface(mesh).map!
    const saved = Array.from((texture as THREE.DataTexture).image.data!)
    const disposed = vi.spyOn(texture, 'dispose')
    const geometryDisposed = vi.spyOn(mesh.geometry, 'dispose')
    h.scene.marks = []; await h.step()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(geometryDisposed).not.toHaveBeenCalled()
    h.scene.marks = [mark('rock', 'rocky')]; await h.step()
    expect(Array.from((surface(bodies()[0]!).map as THREE.DataTexture).image.data!)).toEqual(saved)
    const nextTextureDisposed = vi.spyOn(surface(bodies()[0]!).map!, 'dispose')
    h.unmount()
    expect(nextTextureDisposed).toHaveBeenCalledTimes(1)
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})

it('advances visible gas clouds without selection and freezes hidden, distant or reduced-motion views', async () => {
  const art = await import('./scene-art')
  const advance = vi.spyOn(art, 'advancePlanetClouds')
  const gas = { ...mark('gas', 'gas_giant'), selected: true }
  let now = 100
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const preference = { matches: false }
  vi.stubGlobal('matchMedia', () => preference)
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const h = await mount([gas, mark('other', 'gas_giant')])
  expect((surface(bodies()[0]!) as THREE.Material & { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true)
  h.frameRef.current.projected = new Map([[gas.id, { mark: gas, screen: { x: 600, y: 450, onScreen: true, depth: 10 } }]])
  advance.mockClear()
  const step = async () => { now += 40; await h.step() }
  await step()
  expect(advance).toHaveBeenCalledWith(bodies()[0], expect.closeTo(0.04))
  expect(advance.mock.calls.some(([mesh]) => mesh === bodies()[1])).toBe(false)
  advance.mockClear()
  gas.selected = false; await step(); expect(advance).toHaveBeenCalledWith(bodies()[0], expect.closeTo(0.04))
  advance.mockClear()
  gas.selected = true; preference.matches = true; await step(); expect(advance).not.toHaveBeenCalled()
  preference.matches = false; hidden.mockReturnValue(true); await step(); expect(advance).not.toHaveBeenCalled()
  hidden.mockReturnValue(false); now += 40
  await h.step({ ...h.frameRef.current.camera, distance: 1000 }); expect(advance).not.toHaveBeenCalled()
  h.frameRef.current.projected = new Map(); await step(); expect(advance).not.toHaveBeenCalled()
})

it('bounds animated cloud detail in crowded views while prioritizing the selected giant', async () => {
  const art = await import('./scene-art')
  const advance = vi.spyOn(art, 'advancePlanetClouds')
  let now = 100
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const giants = Array.from({ length: 8 }, (_, i) => ({ ...mark(`giant-${i}`, 'gas_giant'), selected: i === 7 }))
  const h = await mount(giants)
  h.frameRef.current.projected = new Map(giants.map(gas => [gas.id, { mark: gas, screen: { x: 600, y: 450, onScreen: true, depth: 10 } }]))
  advance.mockClear()
  now += 40; await h.step()
  expect(advance.mock.calls.length).toBeGreaterThan(1)
  expect(advance.mock.calls.length).toBeLessThan(giants.length)
  expect(advance).toHaveBeenCalledWith(bodies()[7], expect.closeTo(0.04))
})

const beltField = (memberCount = 10000): SceneModel['beltFields'][number] => ({
  bodyId: 'rocky-belt', center: { x: 0, y: 0, z: 0 }, memberCount,
  elements: { parentId: 'star', radius: 100, periodMs: 10000, phase: 0, inclination: 0, node: 0 },
  ringCenter: { x: 40, y: 12, z: -30 },
})
function rockyBelts() {
  const found: THREE.InstancedMesh[] = []
  world().traverse(object => { if (object instanceof THREE.InstancedMesh) found.push(object) })
  return found
}
it('renders bounded rocky belt detail along the served orbit and follows its parent', async () => {
  const field = beltField()
  const h = await mount([], [field])
  expect(rockyBelts()).toHaveLength(1)
  const rocks = rockyBelts()[0]!
  expect(rocks.count).toBeGreaterThan(0)
  expect(rocks.count).toBeLessThanOrEqual(512)
  expect(rocks.position.toArray()).toEqual([40, 12, -30])
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3()
  for (let i = 0; i < rocks.count; i++) {
    rocks.getMatrixAt(i, matrix)
    position.setFromMatrixPosition(matrix)
    expect(Math.hypot(position.x, position.z)).toBeGreaterThanOrEqual(94.99)
    expect(Math.hypot(position.x, position.z)).toBeLessThanOrEqual(105.01)
    expect(Math.abs(position.y)).toBeLessThanOrEqual(1.21)
  }
  field.ringCenter = { x: -20, y: 4, z: 15 }
  await h.step()
  expect(rockyBelts()[0]).toBe(rocks)
  expect(rocks.position.toArray()).toEqual([-20, 4, 15])
  const hits: THREE.Intersection[] = []
  rocks.raycast(new THREE.Raycaster(), hits)
  expect(hits).toEqual([])
})

it('rebuilds refreshed belt orbits and releases instance resources before remount', async () => {
  const field = beltField(128)
  const h = await mount([], [field])
  const original = rockyBelts()[0]!
  const disposed = vi.spyOn(original, 'dispose')
  const geometryDisposed = vi.spyOn(original.geometry, 'dispose')
  const materialDisposed = vi.spyOn(original.material as THREE.Material, 'dispose')
  field.elements = { ...field.elements, radius: 60 }
  field.memberCount = 32
  await h.step()
  const refreshed = rockyBelts()[0]!
  expect(refreshed).not.toBe(original)
  expect(refreshed.count).toBe(32)
  expect(disposed).toHaveBeenCalledTimes(1)
  expect(geometryDisposed).toHaveBeenCalledTimes(1)
  expect(materialDisposed).toHaveBeenCalledTimes(1)
  const appearance = Array.from(refreshed.instanceMatrix.array)
  const instanceDisposed = vi.spyOn(refreshed, 'dispose')
  h.scene.beltFields = []
  await h.step()
  expect(rockyBelts()).toEqual([])
  expect(instanceDisposed).toHaveBeenCalledTimes(1)
  h.scene.beltFields = [field]
  await h.step()
  const remounted = rockyBelts()[0]!
  expect(Array.from(remounted.instanceMatrix.array)).toEqual(appearance)
  const remountedDisposed = vi.spyOn(remounted, 'dispose')
  h.unmount()
  expect(remountedDisposed).toHaveBeenCalledTimes(1)
  expect(instanceDisposed).toHaveBeenCalledTimes(1)
  expect(disposed).toHaveBeenCalledTimes(1)
})

it('keeps the tactical grid behind opaque belt silhouettes', async () => {
  await mount([], [beltField(32)])
  const material = rockyBelts()[0]!.material as THREE.Material
  const gridMaterial = grid().material as THREE.LineBasicMaterial
  expect(material.transparent).toBe(false)
  expect(material.stencilWrite).toBe(true)
  expect(material.stencilZPass).toBe(THREE.ReplaceStencilOp)
  expect(gridMaterial.stencilFunc).toBe(THREE.EqualStencilFunc)
  expect(gridMaterial.stencilRef).not.toBe(material.stencilRef)
})

it('keeps the main belt target aligned and releases its owned rock on removal', async () => {
  const h = await mount([mark('belt-target', 'belt')])
  const target = bodies()[0]!
  expect(target.position.toArray()).toEqual([20, 1, 10])
  expect(target.scale.x).toBe(2 * BODY_DRAW_SCALE)
  const disposed = vi.spyOn(target.geometry, 'dispose')
  h.scene.marks = []
  await h.step()
  expect(bodies()).toEqual([])
  expect(disposed).toHaveBeenCalledTimes(1)
  h.unmount()
  expect(disposed).toHaveBeenCalledTimes(1)
})


it.each(['anomaly', 'ruin', 'nebula', 'gravity_well', 'debris', 'radiation'])('integrates %s art without changing served transforms and releases its owned resources', async type => {
  const feature = mark('feature-target', type)
  const h = await mount([feature])
  const mesh = bodies()[0]!
  expect(mesh.name).toBe(`feature:${type}`)
  expect(mesh.position.toArray()).toEqual([20, 1, 10])
  expect(mesh.scale.x).toBe(2 * BODY_DRAW_SCALE)
  const resources = new Set<THREE.BufferGeometry | THREE.Material>()
  mesh.traverse(object => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite)) return
    if (!(object instanceof THREE.Sprite)) resources.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      resources.add(material)
      if (material.transparent) expect(material.depthWrite).toBe(false)
      else if (object.geometry.getAttribute('position')) expect(material.stencilZPass).toBe(THREE.ReplaceStencilOp)
    }
  })
  expect(mesh.children.length).toBeGreaterThan(0)
  expect(resources.size).toBeGreaterThanOrEqual(2)
  const releases = [...resources].map(resource => vi.spyOn(resource, 'dispose'))
  await h.step()
  expect(bodies()[0]).toBe(mesh)
  feature.position = { x: -8, y: 3, z: 4 }
  feature.selected = true
  await h.step()
  expect(mesh.position.toArray()).toEqual([-8, 3, 4])
  h.scene.marks = []
  await h.step()
  releases.forEach(release => expect(release).toHaveBeenCalledTimes(1))
  h.unmount()
  releases.forEach(release => expect(release).toHaveBeenCalledTimes(1))
})

it('advances features only with published decorative time, while positions and classification refresh independently', async () => {
  const feature = mark('discovery', 'anomaly')
  const h = await mount([feature])
  const mesh = bodies()[0]!
  const rotations = () => {
    const values: number[][] = []
    mesh.traverse(object => values.push(object.rotation.toArray().slice(0, 3) as number[]))
    return values
  }
  const initial = rotations()
  h.scene.decorativeTimeMs = 2000
  await h.step()
  expect(rotations()).not.toEqual(initial)
  const held = rotations()
  h.scene.positionTimeMs = 9000
  feature.position = { x: 30, y: 0, z: -2 }
  await h.step()
  expect(rotations()).toEqual(held)
  expect(mesh.position.toArray()).toEqual([30, 0, -2])
  h.scene.marks = [{ ...feature, bodyType: 'ruin' }]
  await h.step()
  expect(bodies()[0]).not.toBe(mesh)
  expect(bodies()[0]!.name).toBe('feature:ruin')
})

it('never reveals feature art for an anonymous contact carrying incidental body metadata', async () => {
  await mount([{ ...mark('anonymous', 'ruin'), kind: 'contact' }])
  const mesh = bodies()[0]!
  expect(mesh.name).not.toMatch(/^feature:/)
  expect(mesh.children.some(child => child.name === 'assembly')).toBe(false)
})


it('updates orbit width and brightness on selection, including shared gate paths', async () => {
  const h = await mount([mark('first', 'rocky'), mark('second', 'rocky')])
  const elements = { parentId: 'star', radius: 30, periodMs: 10000, phase: 0, inclination: 0, node: 0 }
  h.scene.orbitRings = ['first', 'second'].map(bodyId => ({ bodyId, parentId: 'star', bodyType: 'gate', elements, parentPosition: { x: 3, y: 0, z: 5 } }))
  const appearance = { brightness: 0.03, thickness: 0.5, selectedBrightness: 0.7, selectedThickness: 2 }
  h.rerender(<SpaceWorld canvas={h.canvas} frameRef={h.frameRef} extent={100} orbitAppearance={appearance} />)
  await h.step()
  const paths = () => {
    const found: Line2[] = []
    world().traverse(object => { if (object instanceof Line2) found.push(object) })
    return found
  }
  expect(paths()).toHaveLength(1)
  const line = paths()[0]!
  expect(line.material.opacity).toBe(0.03)
  expect(line.material.linewidth).toBe(0.5)
  expect(line.position.toArray()).toEqual([3, 0, 5])
  h.scene.marks[1]!.selected = true
  await h.step()
  expect(paths()[0]).toBe(line)
  expect(line.material.opacity).toBe(0.7)
  expect(line.material.linewidth).toBe(2)
  h.scene.marks[1]!.selected = false
  await h.step()
  expect(line.material.opacity).toBe(0.03)
  expect(line.material.linewidth).toBe(0.5)
  const release = vi.spyOn(line.geometry, 'dispose')
  h.scene.orbitRings = []
  await h.step()
  expect(paths()).toHaveLength(0)
  expect(release).toHaveBeenCalledOnce()
})
