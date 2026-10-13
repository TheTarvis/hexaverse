import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import * as THREE from 'three'
import SpaceWorld, { BODY_DRAW_SCALE } from './SpaceWorld'
import { defaultCamera, type SpaceCamera } from '../space-camera'
import { viewBasisOf } from '../space-projection'
import type { SceneMark, SceneModel } from '../space-scene'
import type { SpaceFrame } from '../space-transform-loop'

const capture = vi.hoisted(() => ({ scene: null as unknown, color: null as unknown, rendererOptions: null as unknown }))
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>()
  return { ...actual, WebGLRenderer: class {
    constructor(options: unknown) { capture.rendererOptions = options }
    setClearColor(color: unknown) { capture.color = color }
    setPixelRatio() {}
    setSize() {}
    render(scene: unknown) { capture.scene = scene }
    dispose() {}
  } }
})
let nextFrame: FrameRequestCallback
beforeEach(() => {
  capture.scene = null
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { nextFrame = callback; return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const mark = (id: string, type: string): SceneMark => ({ id, kind: 'body', bodyType: type, radius: 2, position: { x: 20, y: 1, z: 10 }, selected: false, pickable: true })
function mount(marks: SceneMark[]) {
  const camera = defaultCamera(100)
  const scene: SceneModel = { marks, curves: [], beltFields: [], orbitRings: [], positionTimeMs: 0, decorativeTimeMs: 0, omissions: [] }
  const frameRef: { current: SpaceFrame } = { current: { camera, scene, basis: viewBasisOf(camera, { width: 1200, height: 900 }), projected: new Map() } }
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({ createProgram: vi.fn() } as unknown as WebGLRenderingContext)
  const mounted = render(<SpaceWorld canvas={canvas} frameRef={frameRef} extent={100} />)
  function step(nextCamera: SpaceCamera = frameRef.current.camera) {
    frameRef.current = { ...frameRef.current, camera: nextCamera, basis: viewBasisOf(nextCamera, { width: 1200, height: 900 }) }
    nextFrame(1)
  }
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
  it('Scenario: Rocky surface and rim', () => {
    mount([mark('rock', 'rocky'), mark('gas', 'gas_giant')])
    const [rock, gas] = bodies()
    for (const mesh of [rock!, gas!]) {
      expect(surface(mesh)).toBeInstanceOf(THREE.MeshStandardMaterial)
      expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
      expect(surface(mesh).color.getHex()).toBe(0xffffff)
    }
    expect(rock!.children.length).toBeGreaterThan(0)
    for (const child of rock!.children) {
      if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) expect((child.material as THREE.Material).depthWrite).toBe(false)
    }
  })
  it('Scenario: Repeatable and refreshed classification', () => {
    const h = mount([mark('same', 'rocky')])
    const old = bodies()[0]!
    const map = surface(old).map!
    expect(map).toBeInstanceOf(THREE.DataTexture)
    const release = vi.spyOn(map, 'dispose')
    h.step()
    expect(bodies()[0]).toBe(old)
    expect(surface(old).map).toBe(map)
    h.scene.marks = [mark('same', 'gas_giant')]
    h.step()
    expect(surface(bodies()[0]!).map).not.toBe(map)
    expect(release).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Other body types and missing features', () => {
    const h = mount([mark('ice', 'ice'), mark('moon', 'moon'), mark('unknown', 'not-a-type')])
    expect(bodies()).toHaveLength(3)
    expect(surface(bodies()[0]!).map).toBeInstanceOf(THREE.DataTexture)
    expect(surface(bodies()[1]!).map).toBeInstanceOf(THREE.DataTexture)
    expect(surface(bodies()[2]!).map).toBeNull()
    h.scene.marks = []
    h.step()
    expect(bodies()).toHaveLength(0)
  })
  it.each([['belt', 0x8a8d99], ['ruin', 0x9a86c4], ['debris', 0x6f6f7a]] as const)('Scenario: Other body types and missing features — preserves %s fallback', (type, tint) => {
    mount([mark('fallback', type)])
    const material = surface(bodies()[0]!)
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial)
    expect(material.map).toBeNull()
    expect(material.color.getHex()).toBe(tint)
  })
  it('Scenario: Warm reference star / Cool spectral classes remain distinct / Glow follows camera changes', () => {
    const star: SceneMark = { ...mark('sun', ''), kind: 'star', starClass: 'G' }
    const h = mount([star])
    const warm = bodies()[0]!
    const sprites = warm.children.filter((o): o is THREE.Sprite => o instanceof THREE.Sprite)
    expect(sprites.length).toBeGreaterThan(0)
    expect(sprites[0]!.material.map).toBeInstanceOf(THREE.DataTexture)
    expect(sprites[0]!.position.length()).toBe(0)
    const tint = (warm.material as THREE.MeshBasicMaterial).color.clone()
    expect(tint.r).toBeGreaterThan(tint.b)
    h.step({ ...h.frameRef.current.camera, yaw: 1.4 })
    expect(bodies()[0]).toBe(warm)
    h.scene.marks = [{ ...star, starClass: 'O' }]
    h.step()
    const cool = (bodies()[0]!.material as THREE.MeshBasicMaterial).color
    expect(cool.b).toBeGreaterThan(cool.r)
    expect(cool.equals(tint)).toBe(false)
    expect(bodies()).toHaveLength(1)
  })
  it('Scenario: Planar depth reference — grid rejects pixels stamped by opaque body silhouettes', () => {
    const h = mount([mark('solid', 'rocky'), mark('translucent', 'unknown')])
    // Context attributes are fixed at first getContext: renderer options alone
    // cannot reserve stencil after a probe already created a stencil-less context.
    expect(h.canvas.getContext).toHaveBeenNthCalledWith(1, 'webgl2', expect.objectContaining({ stencil: true }))
    expect(capture.rendererOptions).toEqual(expect.objectContaining({ stencil: true }))
    const [solid, translucent] = bodies()
    const bodyMaterial = surface(solid!)
    const gridMaterial = grid().material as THREE.LineBasicMaterial
    expect(bodyMaterial.transparent).toBe(false)
    expect(bodyMaterial.stencilWrite).toBe(true)
    expect(bodyMaterial.stencilZPass).toBe(THREE.ReplaceStencilOp)
    expect(gridMaterial.transparent).toBe(true) // Draw after opaque bodies.
    expect(gridMaterial.stencilWrite).toBe(true)
    expect(gridMaterial.stencilFunc).toBe(THREE.NotEqualStencilFunc)
    expect(gridMaterial.stencilRef).toBe(bodyMaterial.stencilRef)
    expect(gridMaterial.stencilRef).not.toBe(0) // Distinct from cleared background.
    expect(surface(translucent!).stencilWrite).toBe(false)
  })
  it('Scenario: Zoom and angle fade', () => {
    const h = mount([mark('body', 'rocky')])
    const lines = grid()
    const material = lines.material as THREE.LineBasicMaterial
    const initial = material.opacity
    expect(initial).toBeGreaterThan(0)
    h.step({ ...h.frameRef.current.camera, distance: 600 })
    expect(material.opacity).toBeLessThan(initial)
    h.step({ ...h.frameRef.current.camera, distance: 45, pitch: 0.001 })
    expect(material.opacity).toBeLessThan(initial)
    expect(material.opacity).toBeGreaterThanOrEqual(0)
    expect(grid()).toBe(lines)
  })
  it('Scenario: Selection and realtime refresh', () => {
    const original = mark('body', 'rocky')
    const h = mount([original])
    const snapshot = JSON.stringify(h.frameRef.current)
    const mesh = bodies()[0]!
    expect(mesh.position.toArray()).toEqual([20, 1, 10])
    expect(mesh.scale.x).toBe(2 * BODY_DRAW_SCALE)
    expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
    h.step()
    expect(JSON.stringify(h.frameRef.current)).toBe(snapshot)
    expect(bodies()).toHaveLength(1)
  })
  it('Scenario: Scene removal and remount', () => {
    const h = mount([mark('rock', 'rocky')])
    const mesh = bodies()[0]!
    expect(surface(mesh).map).toBeInstanceOf(THREE.DataTexture)
    const texture = surface(mesh).map!
    const saved = Array.from((texture as THREE.DataTexture).image.data!)
    const disposed = vi.spyOn(texture, 'dispose')
    const geometryDisposed = vi.spyOn(mesh.geometry, 'dispose')
    h.scene.marks = []; h.step()
    expect(disposed).toHaveBeenCalledTimes(1)
    expect(geometryDisposed).not.toHaveBeenCalled()
    h.scene.marks = [mark('rock', 'rocky')]; h.step()
    expect(Array.from((surface(bodies()[0]!).map as THREE.DataTexture).image.data!)).toEqual(saved)
    const nextTextureDisposed = vi.spyOn(surface(bodies()[0]!).map!, 'dispose')
    h.unmount()
    expect(nextTextureDisposed).toHaveBeenCalledTimes(1)
    expect(geometryDisposed).toHaveBeenCalledTimes(1)
    expect(disposed).toHaveBeenCalledTimes(1)
  })
})

it('only advances a selected, visible gas giant large enough to inspect', async () => {
  const { advancePlanetClouds } = await import('./scene-art')
  // Capture the real material uniform through the Three shader hook.
  const gas = { ...mark('gas', 'gas_giant'), selected: true }
  let now = 100
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const preference = { matches: false }
  vi.stubGlobal('matchMedia', () => preference)
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const h = mount([gas, mark('other', 'gas_giant')])
  const uniforms = bodies().map(mesh => {
    const shader = { uniforms: {}, vertexShader: '#include <uv_vertex>' } as unknown as THREE.WebGLProgramParametersWithUniforms
    surface(mesh).onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    return shader.uniforms.cloudTime!
  })
  h.frameRef.current.projected = new Map([[gas.id, { mark: gas, screen: { x: 600, y: 450, onScreen: true, depth: 10 } }]])
  const step = () => { now += 40; h.step() }
  step()
  expect(uniforms[0]!.value).toBeCloseTo(0.04)
  expect(uniforms[1]!.value).toBe(0)
  gas.selected = false; step()
  expect(uniforms[0]!.value).toBeCloseTo(0.04)
  gas.selected = true; preference.matches = true; step()
  expect(uniforms[0]!.value).toBeCloseTo(0.04)
  preference.matches = false; hidden.mockReturnValue(true); step()
  expect(uniforms[0]!.value).toBeCloseTo(0.04)
  hidden.mockReturnValue(false)
  now += 40
  h.step({ ...h.frameRef.current.camera, distance: 1000 })
  expect(uniforms[0]!.value).toBeCloseTo(0.04) // Too small on-screen.
  h.frameRef.current.projected = new Map(); step()
  expect(uniforms[0]!.value).toBeCloseTo(0.04)
  advancePlanetClouds(bodies()[0]!, 200)
  expect(uniforms[0]!.value).toBeCloseTo(0.14) // No catch-up leap after a stall.
})
