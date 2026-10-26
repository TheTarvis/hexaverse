import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { MapCameraRig, type MapCameraOptions, type MapCameraTarget } from './map-camera-rig'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks() })
function setup(up = new THREE.Vector3(0, 0, 1), options: MapCameraOptions = {}) {
  const host = document.createElement('div'); document.body.append(host)
  Object.defineProperties(host, { clientWidth: { value: 1200 }, clientHeight: { value: 900 } })
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 900 } as DOMRect)
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100000)
  camera.up.copy(up)
  camera.position.copy(up.z ? new THREE.Vector3(10, -20, 30) : new THREE.Vector3(10, 30, 20))
  const onIntent = vi.fn(), onRest = vi.fn()
  const rig = new MapCameraRig(camera, host, host, null, false, { up, onIntent, onRest, ...options })
  rig.update()
  cleanups.push(() => { rig.dispose(); host.remove() })
  const pointer = (type: string, x: number, y: number, options: PointerEventInit = {}) => host.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...options }))
  const drag = (options: PointerEventInit = {}) => { pointer('pointerdown', 300, 300, options); pointer('pointermove', 360, 330, options); pointer('pointerup', 360, 330, options) }
  return { host, camera, rig, pointer, drag, onIntent, onRest }
}
for (const axis of ['galaxy Z', 'system Y']) describe('shared camera: '+axis, () => {
  const up = () => axis === 'galaxy Z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  it('left-drag and one-finger drag orbit around the target without panning', () => {
    for (const pointerType of ['mouse', 'touch']) {
      const { camera, rig, drag } = setup(up()), before = camera.position.clone(), target = rig.controls.target.clone()
      drag({ pointerType })
      expect(camera.position.distanceTo(before)).toBeGreaterThan(0.1)
      expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-9)
      expect(camera.position.distanceTo(target)).toBeCloseTo(before.distanceTo(target), 8)
    }
  })
  it('wheel zooms while right/middle drags leave the camera alone', () => {
    const { host, camera, rig, drag } = setup(up()), distance = camera.position.length(), target = rig.controls.target.clone()
    drag({ button: 2 }); drag({ button: 1 })
    expect(camera.position.length()).toBeCloseTo(distance)
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-9)
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }))
    expect(camera.position.length()).toBeLessThan(distance)
    const closer = camera.position.length()
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: 100 }))
    expect(camera.position.length()).toBeGreaterThan(closer)
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-9)
  })
  it('parallel vertical two-finger drag zooms without pan or orbit', () => {
    const { camera, rig, pointer } = setup(up()), distance = camera.position.length(), direction = camera.position.clone().normalize()
    pointer('pointerdown', 200, 400, { pointerType: 'touch', pointerId: 1, isPrimary: true })
    pointer('pointerdown', 300, 400, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    pointer('pointermove', 200, 370, { pointerType: 'touch', pointerId: 1, isPrimary: true })
    pointer('pointermove', 300, 370, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    expect(camera.position.length()).toBeLessThan(distance)
    expect(rig.controls.target.length()).toBeCloseTo(0)
    expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-8)
    const zoomed = camera.position.length()
    pointer('pointerup', 300, 370, { pointerType: 'touch', pointerId: 2 })
    pointer('pointermove', 100, 100, { pointerType: 'touch', pointerId: 1 })
    expect(camera.position.length()).toBeCloseTo(zoomed)
    expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-8)
    pointer('pointerup', 100, 100, { pointerType: 'touch', pointerId: 1 })
    expect(rig.gestureActive).toBe(true)
  })
  it('focus preserves offset and subsequent orbit uses the focused object', () => {
    const { camera, rig, drag } = setup(up()), offset = camera.position.clone().sub(rig.controls.target), target = new THREE.Vector3(100, 50, 30)
    rig.focus(target, 0)
    expect(camera.position.clone().sub(rig.controls.target).distanceTo(offset)).toBeLessThan(1e-8)
    drag()
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-8)
    expect(camera.position.distanceTo(target)).toBeCloseTo(offset.length(), 8)
  })
  it('camera keys neither move the camera nor consume keyboard events', () => {
    const { host, camera, rig } = setup(up()), before = camera.position.clone(), target = rig.controls.target.clone()
    for (const key of ['w', 'a', 's', 'd', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=', '_', 'Home', 'Enter']) {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
      host.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(false)
    }
    expect(camera.position.distanceTo(before)).toBeLessThan(1e-9)
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-9)
  })
  it('announces settled overlays once after damping, without a callback every frame', () => {
    const { rig, drag, onRest } = setup(up())
    drag()
    for (let i = 0; i < 250; i++) rig.update()
    expect(onRest).toHaveBeenCalledOnce()
    for (let i = 0; i < 100; i++) rig.update()
    expect(onRest).toHaveBeenCalledOnce()
  })
  it('disabled controls do not consume wheel or move the camera', () => {
    const { host, camera, rig, drag } = setup(up()), before = camera.position.clone()
    rig.controls.enabled = false; drag()
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }); host.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false); expect(camera.position.distanceTo(before)).toBe(0)
  })
})

describe('live focus glides', () => {
  it('glides to a moving target at the requested distance, then follows without drift', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const { camera, rig } = setup()
    let position = { x: 100, y: 50, z: 0 }
    rig.follow(() => ({ position }), 20, 600)
    now = 300; position = { x: 120, y: 50, z: 0 }; rig.update()
    expect(rig.controls.target.x).toBeCloseTo(60)
    now = 600; rig.update()
    expect(rig.controls.target.x).toBeCloseTo(120)
    expect(camera.position.distanceTo(rig.controls.target)).toBeCloseTo(20)
    const offset = camera.position.clone().sub(rig.controls.target)
    position = { x: 150, y: 70, z: 10 }; rig.update()
    expect(rig.controls.target.distanceTo(new THREE.Vector3(150, 70, 10))).toBeLessThan(1e-8)
    expect(camera.position.clone().sub(rig.controls.target).distanceTo(offset)).toBeLessThan(1e-8)
  })
  it('inspection leaves the glide active; zoom cancels the glide and explicit release stops following', () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const { host, rig, pointer, camera } = setup()
    const position = { x: 100, y: 50, z: 0 }
    rig.follow(() => ({ position }), 20, 600)
    pointer('pointerdown', 300, 300); pointer('pointerup', 300, 300)
    now = 300; rig.update(); expect(rig.controls.target.x).toBeCloseTo(50)
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }))
    now = 600; rig.update()
    const distance = camera.position.distanceTo(rig.controls.target)
    position.x = 150; rig.update()
    expect(rig.controls.target.x).toBeCloseTo(150)
    expect(camera.position.distanceTo(rig.controls.target)).toBeCloseTo(distance)
    rig.stopFollowing()
    const target = rig.controls.target.clone()
    position.x = 200; rig.update()
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-8)
  })
  it('losing a target cancels its glide at the last camera pose', () => {
    let now = 0, present = true
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    const { camera, rig } = setup()
    rig.follow(() => present ? { position: { x: 100, y: 0, z: 0 } } : null, 20, 600)
    now = 300; rig.update()
    const previous = camera.position.clone(), target = rig.controls.target.clone()
    present = false; now = 600; rig.update()
    expect(camera.position.distanceTo(previous)).toBeLessThan(1e-8)
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-8)
  })
  it('reduced motion repositions immediately and keeps following', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    const { rig, camera } = setup()
    const position = { x: 100, y: 0, z: 0 }
    rig.follow(() => ({ position }), 20, 600)
    expect(rig.controls.target.x).toBeCloseTo(100)
    expect(camera.position.distanceTo(rig.controls.target)).toBeCloseTo(20)
    position.x = 110; rig.update()
    expect(rig.controls.target.x).toBeCloseTo(110)
  })
})

it('pinch and two-finger swipes retain following until explicitly released', () => {
  const { rig, pointer, onIntent } = setup()
  const position = { x: 100, y: 0, z: 0 }
  rig.follow(() => ({ position }), 20, 0)
  pointer('pointerdown', 200, 400, { pointerType: 'touch', pointerId: 1, isPrimary: true })
  pointer('pointerdown', 300, 400, { pointerType: 'touch', pointerId: 2, isPrimary: false })
  pointer('pointermove', 180, 400, { pointerType: 'touch', pointerId: 1, isPrimary: true })
  pointer('pointermove', 320, 400, { pointerType: 'touch', pointerId: 2, isPrimary: false })
  expect(onIntent.mock.calls.every(([intent]) => intent === 'zoom')).toBe(true)
  position.x = 110; rig.update(); expect(rig.controls.target.x).toBeCloseTo(110)
  pointer('pointermove', 240, 430, { pointerType: 'touch', pointerId: 1, isPrimary: true })
  pointer('pointermove', 380, 430, { pointerType: 'touch', pointerId: 2, isPrimary: false })
  expect(onIntent.mock.calls.every(([intent]) => intent === 'zoom')).toBe(true)
  rig.stopFollowing()
  rig.clearMotion()
  const target = rig.controls.target.clone(); position.x = 150; rig.update()
  expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-8)
})

for (const up of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)]) {
  it(`chooses nearest visible screen-direction target once per wheel gesture (${up.toArray()})`, () => {
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const targets: MapCameraTarget[] = []
    const { host, camera, rig } = setup(up, { targets: () => targets, selectedId: () => 'selected' })
    camera.updateMatrixWorld(true)
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const add = (id: string, x: number, y = 0) => {
      const activate = vi.fn()
      targets.push({ id, position: right.clone().multiplyScalar(x).addScaledVector(screenUp, y), activate })
      return activate
    }
    const left = add('left', -4), far = add('far', 8), high = add('high', 1, 10)
    const near = add('near', 3), selected = add('selected', 0.5), offscreen = add('offscreen', 10000)
    const behind = vi.fn()
    targets.push({ id: 'behind', position: camera.position.clone().multiplyScalar(2).add(right), activate: behind })
    const wheel = (x: number, y = 0) => host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: x, deltaY: y }))
    const target = rig.controls.target.clone(), distance = camera.position.distanceTo(target)
    wheel(15, 1); expect(near).not.toHaveBeenCalled()
    wheel(20, 1); expect(near).toHaveBeenCalledOnce()
    now += 40; wheel(100, 50); now += 40; wheel(80)
    expect(near).toHaveBeenCalledOnce()
    expect(camera.position.distanceTo(target)).toBeCloseTo(distance)
    for (const activate of [far, high, selected, offscreen, behind]) expect(activate).not.toHaveBeenCalled()
    now += 300; wheel(-35); expect(left).toHaveBeenCalledOnce()
    targets.splice(0)
    now += 300; wheel(35)
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-9)
  })
}

it('locks diagonal wheel gestures to zoom', () => {
  const activate = vi.fn()
  const { host, camera } = setup(undefined, { targets: () => [{ id: 'next', position: { x: 3, y: 0, z: 0 }, activate }] })
  const distance = camera.position.length()
  host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 1, deltaY: -20 }))
  host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 100, deltaY: 0 }))
  expect(camera.position.length()).toBeLessThan(distance)
  expect(activate).not.toHaveBeenCalled()
})

it('a horizontal two-finger swipe switches once and suppresses release clicks', () => {
  const targets: MapCameraTarget[] = [], activate = vi.fn()
  const { camera, rig, pointer, host } = setup(undefined, { targets: () => targets })
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
  targets.push({ id: 'next', position: right.multiplyScalar(3), activate })
  const click = vi.fn(); host.addEventListener('click', click)
  pointer('pointerdown', 200, 400, { pointerType: 'touch', pointerId: 1 })
  pointer('pointerdown', 300, 400, { pointerType: 'touch', pointerId: 2 })
  pointer('pointermove', 240, 400, { pointerType: 'touch', pointerId: 1 })
  pointer('pointermove', 340, 400, { pointerType: 'touch', pointerId: 2 })
  pointer('pointermove', 290, 420, { pointerType: 'touch', pointerId: 1 })
  pointer('pointermove', 390, 420, { pointerType: 'touch', pointerId: 2 })
  expect(activate).toHaveBeenCalledOnce()
  expect(rig.controls.target.length()).toBeCloseTo(0)
  pointer('pointerup', 390, 420, { pointerType: 'touch', pointerId: 2 })
  pointer('pointerup', 290, 420, { pointerType: 'touch', pointerId: 1 })
  host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  expect(click).not.toHaveBeenCalled()
})

it('supports a pinch with one stationary finger after coalescing pointer moves', () => {
  vi.useFakeTimers()
  try {
    const { pointer, camera, rig } = setup()
    const distance = camera.position.length()
    pointer('pointerdown', 200, 400, { pointerType: 'touch', pointerId: 1 })
    pointer('pointerdown', 300, 400, { pointerType: 'touch', pointerId: 2 })
    pointer('pointermove', 360, 400, { pointerType: 'touch', pointerId: 2 })
    vi.advanceTimersToNextFrame()
    expect(camera.position.length()).toBeLessThan(distance)
    expect(rig.controls.target.length()).toBeCloseTo(0)
  } finally { vi.useRealTimers() }
})

it('glides around a target to its lit side without cutting through the object', () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const { camera, rig, drag } = setup()
  const distance = camera.position.length()
  const direction = camera.position.clone().negate().normalize()
  rig.follow(() => ({ position: { x: 0, y: 0, z: 0 } }), distance, 600, direction)
  now = 300; rig.update()
  expect(camera.position.length()).toBeCloseTo(distance)
  now = 600; rig.update()
  expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-8)
  drag()
  expect(camera.position.clone().normalize().distanceTo(direction)).toBeGreaterThan(0.01)
  expect(rig.isFollowing).toBe(true)
})

it.each([new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)])('keeps tilt throughout a sunward turn with scene up %s', up => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
  const { camera, rig } = setup(up)
  const distance = camera.position.length(), elevation = camera.position.dot(up) / distance
  const direction = camera.position.clone().applyAxisAngle(up, Math.PI).normalize()
  rig.follow(() => ({ position: { x: 0, y: 0, z: 0 } }), distance, 600, direction)
  for (now = 100; now <= 600; now += 100) {
    rig.update()
    expect(camera.position.dot(up) / camera.position.length()).toBeCloseTo(elevation)
    expect(camera.position.length()).toBeCloseTo(distance)
  }
  expect(camera.position.clone().normalize().distanceTo(direction)).toBeLessThan(1e-8)
})
