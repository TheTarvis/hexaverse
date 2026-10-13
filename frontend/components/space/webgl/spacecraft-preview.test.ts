import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

const capture = vi.hoisted(() => ({ options: {} as Record<string, unknown>, scene: null as unknown, camera: null as unknown, clear: [] as unknown[], pixelRatio: 0, renders: 0, disposed: 0, fail: false }))
vi.mock('@/components/render-guard/renderer-candidate', () => ({ createRendererCandidate: (options: { canvas: HTMLCanvasElement }) => {
  capture.options = options
  return { canvas: options.canvas, init: async () => { if (capture.fail) throw new Error('No GPU') }, backend: () => 'webgl2',
    setClearColor: (...args: unknown[]) => { capture.clear = args },
    resize: (_width: number, _height: number, ratio: number) => { capture.pixelRatio = ratio },
    render: (scene: unknown, camera: unknown) => { capture.scene = scene; capture.camera = camera; capture.renders++ },
    onLoss: (listener: () => void) => { options.canvas.addEventListener('webglcontextlost', listener); return () => options.canvas.removeEventListener('webglcontextlost', listener) },
    dispose: () => { capture.disposed++ } }
} }))
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve() }

const loads = vi.hoisted(() => ({ entries: [] as { url: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }[] }))
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class {
  loadAsync(url: string) { return new Promise((resolve, reject) => loads.entries.push({ url, resolve, reject })) }
} }))
interface Controller { setAccentColor(color: number): void; resize(w: number, h: number): void; rotate(yaw: number, pitch: number): void; reset(): void; dispose(): void }
interface Preview { createSpacecraftPreview(canvas: HTMLCanvasElement, kind: 'ship' | 'station' | 'gas_giant' | 'rocky' | 'ice' | 'moon', accent: number, onStatus: (status: string) => void): Controller }
async function controller(kind: 'ship' | 'station' | 'gas_giant' | 'rocky' | 'ice' | 'moon' = 'ship') {
  const path = './spacecraft-preview'
  const exports = await import(/* @vite-ignore */ path).catch(() => null) as Preview | null
  expect(exports, 'Contracted preview controller exists').not.toBeNull()
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({} as WebGLRenderingContext)
  const status = vi.fn()
  const c = exports!.createSpacecraftPreview(canvas, kind, 0x4ade80, status)
  await flush()
  return { c, canvas, status }
}
function source() {
  const group = new THREE.Group()
  const texture = new THREE.DataTexture(new Uint8Array([100, 100, 100, 255]), 1, 1)
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 2), new THREE.MeshStandardMaterial({ map: texture })))
  return group
}
async function settle(scene = source()) {
  expect(loads.entries).toHaveLength(1)
  loads.entries[0]!.resolve({ scene })
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  return scene
}
function scene() { expect(capture.scene).toBeInstanceOf(THREE.Scene); return capture.scene as THREE.Scene }
function model() { const objects = scene().children.filter(o => o instanceof THREE.Mesh); expect(objects).toHaveLength(1); return objects[0]! }
function watch(root: THREE.Object3D) {
  const all = new Set<THREE.BufferGeometry | THREE.Material | THREE.Texture>()
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return
    all.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      all.add(m)
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) all.add(value)
    }
  })
  return [...all].map(resource => vi.spyOn(resource, 'dispose'))
}
beforeEach(() => {
  Object.assign(capture, { options: {}, scene: null, camera: null, clear: [], pixelRatio: 0, renders: 0, disposed: 0, fail: false })
  loads.entries = []
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('setInterval', vi.fn())
  vi.stubGlobal('devicePixelRatio', 3)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('spacecraft preview real Three controller', () => {
  it.each(['gas_giant', 'rocky', 'ice', 'moon'] as const)('renders and releases the %s surface without loading a spacecraft asset', async kind => {
    const { c, status } = await controller(kind)
    c.resize(300, 200)
    expect(status).toHaveBeenLastCalledWith('ready')
    expect(loads.entries).toHaveLength(0)
    expect((model().material as THREE.MeshStandardMaterial).map).toBeInstanceOf(THREE.DataTexture)
    const resources = watch(model())
    c.rotate(0.4, 0.2)
    expect(model().rotation.y).toBeCloseTo(0.4)
    c.reset()
    expect(model().rotation.y).toBe(0)
    c.dispose(); c.dispose()
    resources.forEach(spy => expect(spy).toHaveBeenCalledTimes(1))
  })
  it.each(['ship', 'station'] as const)('Scenario: %s detail preview — transparent camera frames complete unit artwork', async kind => {
    const { c } = await controller(kind)
    c.resize(300, 200)
    expect(capture.options.alpha).toBe(true)
    expect(capture.clear[1]).toBe(0)
    expect(scene().background).toBeNull()
    expect(capture.pixelRatio).toBeLessThanOrEqual(2)
    expect(scene().children.some(o => o instanceof THREE.AmbientLight)).toBe(true)
    expect(scene().children.some(o => o instanceof THREE.DirectionalLight)).toBe(true)
    const camera = capture.camera as THREE.PerspectiveCamera
    expect(camera.fov).toBe(35)
    expect(camera.position.clone().normalize().distanceTo(new THREE.Vector3(3, 2, -3).normalize())).toBeLessThan(0.00001)
    for (const [width, height] of [[300, 200], [100, 200]]) {
      c.resize(width!, height!)
      const halfAngle = Math.min(35 * Math.PI / 360, Math.atan(Math.tan(35 * Math.PI / 360) * width! / height!))
      expect(camera.position.length() * Math.sin(halfAngle)).toBeGreaterThanOrEqual(1.0999)
    }
    expect(loads.entries[0]!.url).toBe(kind === 'ship' ? '/models/space/utility-ship.glb' : '/models/space/orbital-station.glb')
    c.dispose()
  })
  it('Scenario: Pointer rotation and reset / Keyboard orientation and focus exit — controller bounds and fixed camera', async () => {
    const { c } = await controller(); c.resize(300, 200)
    const camera = (capture.camera as THREE.PerspectiveCamera).position.clone()
    const initial = model().quaternion.clone()
    c.rotate(Math.PI / 12, 99)
    expect(model().rotation.x).toBeCloseTo(Math.PI / 3)
    expect(model().quaternion.equals(initial)).toBe(false)
    c.rotate(8 * Math.PI, -999)
    expect(model().rotation.x).toBeCloseTo(-Math.PI / 3)
    expect(Math.abs(model().rotation.y)).toBeLessThanOrEqual(2 * Math.PI)
    c.reset(); await flush(); expect(model().quaternion.equals(initial)).toBe(true)
    expect((capture.camera as THREE.PerspectiveCamera).position.equals(camera)).toBe(true)
    c.dispose()
  })
  it('Scenario: No autonomous rotation — demand-driven only and nonpositive sizes skip drawing', async () => {
    const { c } = await controller()
    c.resize(0, 0); await flush(); expect(capture.renders).toBe(0)
    c.resize(300, 200); await flush(); const once = capture.renders
    expect(once).toBe(1)
    c.resize(300, 200); await flush(); expect(capture.renders).toBeLessThanOrEqual(once + 1)
    c.rotate(0.2, 0.1); await flush(); expect(capture.renders).toBeGreaterThan(once)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(setInterval).not.toHaveBeenCalled()
    const last = capture.renders
    c.resize(0, 200); await flush(); c.rotate(0.1, 0.1); await flush(); expect(capture.renders).toBe(last)
    c.resize(300, 200); await flush(); expect(capture.renders).toBeGreaterThan(last)
    c.dispose()
  })
  it('Scenario: Delayed preview load — current orientation survives successful replacement', async () => {
    const { c, status } = await controller(); c.resize(300, 200)
    expect(status).toHaveBeenCalledWith('loading')
    c.rotate(0.6, 0.2)
    const old = model(), pose = old.quaternion.clone(), disposed = watch(old)
    await settle()
    expect(status).toHaveBeenLastCalledWith('ready')
    expect(model()).not.toBe(old)
    expect(model().quaternion.equals(pose)).toBe(true)
    expect(model().position.toArray()).toEqual([0, 0, 0])
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
    c.dispose()
  })
  it.each(['reject', 'empty'] as const)('Scenario: Failed asset or unavailable rendering — %s retains usable fallback', async reason => {
    const { c, status } = await controller(); c.resize(300, 200)
    const fallback = model()
    if (reason === 'reject') { loads.entries[0]!.reject(new Error('decode failed')); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
    else await settle(new THREE.Group())
    expect(status).toHaveBeenLastCalledWith('fallback')
    expect(model()).toBe(fallback)
    expect(() => c.rotate(0.2, 0.1)).not.toThrow()
    c.dispose()
  })
  it('Scenario: Failed asset or unavailable rendering — GPU and context loss are local', async () => {
    capture.fail = true
    const failed = await controller()
    expect(failed.status).toHaveBeenLastCalledWith('unavailable')
    expect(() => { failed.c.resize(300, 200); failed.c.rotate(1, 1); failed.c.reset(); failed.c.dispose() }).not.toThrow()
    capture.fail = false
    const { c, canvas, status } = await controller(); c.resize(300, 200)
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
    expect(status).toHaveBeenLastCalledWith('interrupted')
    const count = capture.renders
    c.rotate(0.4, 0.3); await flush(); c.resize(400, 200); await flush(); expect(capture.renders).toBe(count)
    c.dispose()
  })
  it('Scenario: Closing or hiding a retained panel / Reopen and bounded instances — resources released exactly once', async () => {
    const { c, canvas } = await controller(); c.resize(300, 200)
    const remove = vi.spyOn(canvas, 'removeEventListener')
    const original = await settle(), originalDisposal = watch(original), instanceDisposal = watch(model())
    c.dispose(); c.dispose()
    for (const spy of [...originalDisposal, ...instanceDisposal]) expect(spy).toHaveBeenCalledTimes(1)
    expect(capture.disposed).toBe(1)
    expect(remove.mock.calls.some(([type]) => type === 'webglcontextlost')).toBe(true)
    const count = capture.renders
    c.rotate(1, 1); await flush(); c.resize(300, 200); await flush(); expect(capture.renders).toBe(count)
  })
  it('Scenario: Entity change and late completion — disposed preview never republishes', async () => {
    const { c, status } = await controller(); c.resize(300, 200)
    c.dispose(); status.mockClear()
    const original = source(), disposed = watch(original), count = capture.renders
    await settle(original)
    for (const spy of disposed) expect(spy).toHaveBeenCalledTimes(1)
    expect(status).not.toHaveBeenCalled()
    expect(capture.renders).toBe(count)
  })
})


// Authorized preview integrity amendment: mode-color refresh is not a new
// inspected entity and must preserve accepted orientation and renderer ownership.
it('Scenario: No autonomous rotation — same-entity accent changes preserve pose and pending load uses latest color', async () => {
  const { c } = await controller(); c.resize(300, 200); await flush(); c.rotate(0.5, 0.3)
  const pose = model().quaternion.clone(), camera = (capture.camera as THREE.PerspectiveCamera).position.clone()
  const accent = (color: number) => {
    let found = false
    model().traverseVisible(o => {
      if (!(o instanceof THREE.Mesh) || !o.geometry.getAttribute('position')?.count) return
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if ('color' in m && (m.color as THREE.Color).getHex() === color) found = true
    })
    expect(found, 'Current mode color has a real visible accent surface').toBe(true)
  }
  expect(c.setAccentColor).toBeTypeOf('function')
  c.setAccentColor(0xffb454)
  expect(model().quaternion.equals(pose)).toBe(true); accent(0xffb454)
  await settle()
  expect(model().quaternion.equals(pose)).toBe(true); accent(0xffb454)
  c.setAccentColor(0xc4b5fd)
  expect(model().quaternion.equals(pose)).toBe(true); accent(0xc4b5fd)
  expect((capture.camera as THREE.PerspectiveCamera).position.equals(camera)).toBe(true)
  expect(loads.entries).toHaveLength(1)
  expect(capture.disposed).toBe(0)
  c.dispose(); expect(capture.disposed).toBe(1)
})

it('gas animation is capped, pauses for visibility and reduced motion, and releases its loop', async () => {
  let callback: FrameRequestCallback | undefined
  const request = vi.fn((next: FrameRequestCallback) => { callback = next; return 7 })
  vi.stubGlobal('requestAnimationFrame', request)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const preference = new EventTarget() as EventTarget & { matches: boolean }
  preference.matches = false
  vi.stubGlobal('matchMedia', () => preference)
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const { c, canvas } = await controller('gas_giant')
  c.resize(300, 200)
  expect(capture.pixelRatio * 300).toBeLessThanOrEqual(384)
  expect(request).toHaveBeenCalledTimes(1)
  const initial = capture.renders
  callback!(100); await flush(); callback!(116); await flush()
  expect(capture.renders).toBe(initial)
  callback!(134); await flush()
  expect(capture.renders).toBe(initial + 1)
  hidden.mockReturnValue(true)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(cancelAnimationFrame).toHaveBeenCalledWith(7)
  const requests = request.mock.calls.length
  callback!(5000)
  expect(request).toHaveBeenCalledTimes(requests)
  hidden.mockReturnValue(false)
  document.dispatchEvent(new Event('visibilitychange'))
  expect(request).toHaveBeenCalledTimes(requests + 1)
  preference.matches = true
  preference.dispatchEvent(new Event('change'))
  callback!(6000)
  expect(capture.renders).toBe(initial + 1)
  preference.matches = false
  preference.dispatchEvent(new Event('change'))
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
  const afterLoss = request.mock.calls.length
  callback!(7000)
  expect(request).toHaveBeenCalledTimes(afterLoss)
  c.dispose()
  document.dispatchEvent(new Event('visibilitychange'))
  preference.dispatchEvent(new Event('change'))
  expect(request).toHaveBeenCalledTimes(afterLoss)
})

it('gas preview sleeps while scrolled out of view or zero-sized', async () => {
  let intersect: (entries: { isIntersecting: boolean }[]) => void = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback }
    observe() {}
    disconnect = disconnect
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const request = vi.fn(() => 11)
  vi.stubGlobal('requestAnimationFrame', request)
  const { c } = await controller('gas_giant')
  c.resize(300, 200)
  expect(request).not.toHaveBeenCalled()
  intersect([{ isIntersecting: true }])
  expect(request).toHaveBeenCalledTimes(1)
  intersect([{ isIntersecting: false }])
  expect(cancelAnimationFrame).toHaveBeenCalledWith(11)
  c.resize(0, 0)
  intersect([{ isIntersecting: true }])
  expect(request).toHaveBeenCalledTimes(1)
  c.resize(300, 200)
  expect(request).toHaveBeenCalledTimes(2)
  c.dispose()
  expect(disconnect).toHaveBeenCalledTimes(1)
  intersect([{ isIntersecting: true }])
  expect(request).toHaveBeenCalledTimes(2)
})
