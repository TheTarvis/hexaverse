import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { MapCameraRig } from './map-camera-rig'

const cleanups: (() => void)[] = []
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks() })
function setup(up = new THREE.Vector3(0, 0, 1)) {
  const host = document.createElement('div'); document.body.append(host)
  Object.defineProperties(host, { clientWidth: { value: 1200 }, clientHeight: { value: 900 } })
  host.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 900 } as DOMRect)
  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100000)
  camera.up.copy(up)
  camera.position.copy(up.z ? new THREE.Vector3(10, -20, 30) : new THREE.Vector3(10, 30, 20))
  const onIntent = vi.fn(), home = vi.fn(), confirm = vi.fn(), onRest = vi.fn()
  const rig = new MapCameraRig(camera, host, host, null, false, { up, onIntent, onRest, onHome: home, onConfirm: confirm })
  rig.update()
  cleanups.push(() => { rig.dispose(); host.remove() })
  const pointer = (type: string, x: number, y: number, options: PointerEventInit = {}) => host.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...options }))
  const drag = (options: PointerEventInit = {}) => { pointer('pointerdown', 300, 300, options); pointer('pointermove', 360, 330, options); pointer('pointerup', 360, 330, options) }
  return { host, camera, rig, pointer, drag, onIntent, home, confirm, onRest }
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
  it('right-drag and plain wheel pan on the scene ground plane', () => {
    const { host, camera, rig, drag } = setup(up()), distance = camera.position.distanceTo(rig.controls.target)
    drag({ button: 2 })
    expect(rig.controls.target.length()).toBeGreaterThan(0)
    expect(rig.controls.target.dot(up())).toBeCloseTo(0, 8)
    const target = rig.controls.target.clone()
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 20, deltaY: 30 }))
    expect(rig.controls.target.distanceTo(target)).toBeGreaterThan(0)
    expect(camera.position.distanceTo(rig.controls.target)).toBeCloseTo(distance, 8)
  })
  it('Ctrl+wheel and middle-drag dolly without changing target', () => {
    const { host, camera, rig, drag } = setup(up()), distance = camera.position.length()
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }))
    expect(camera.position.length()).toBeLessThan(distance)
    const before = camera.position.length()
    drag({ button: 1 })
    expect(camera.position.length()).not.toBeCloseTo(before, 8)
    expect(rig.controls.target.length()).toBeCloseTo(0, 8)
  })
  it('parallel two-finger drag pans; spread zooms without orbit', () => {
    const { camera, rig, pointer } = setup(up()), distance = camera.position.length(), direction = camera.position.clone().normalize()
    pointer('pointerdown', 200, 400, { pointerType: 'touch', pointerId: 1, isPrimary: true })
    pointer('pointerdown', 300, 400, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    pointer('pointermove', 230, 420, { pointerType: 'touch', pointerId: 1, isPrimary: true })
    pointer('pointermove', 330, 420, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    expect(rig.controls.target.length()).toBeGreaterThan(0)
    expect(camera.position.clone().sub(rig.controls.target).normalize().distanceTo(direction)).toBeLessThan(1e-8)
    pointer('pointermove', 410, 420, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    expect(camera.position.distanceTo(rig.controls.target)).toBeLessThan(distance)
    expect(camera.position.clone().sub(rig.controls.target).normalize().distanceTo(direction)).toBeLessThan(1e-8)
    pointer('pointerup', 410, 420, { pointerType: 'touch', pointerId: 2, isPrimary: false })
    pointer('pointerup', 230, 420, { pointerType: 'touch', pointerId: 1, isPrimary: true })
  })
  it('focus preserves offset and subsequent orbit uses the focused object', () => {
    const { camera, rig, drag } = setup(up()), offset = camera.position.clone().sub(rig.controls.target), target = new THREE.Vector3(100, 50, 30)
    rig.focus(target, 0)
    expect(camera.position.clone().sub(rig.controls.target).distanceTo(offset)).toBeLessThan(1e-8)
    drag()
    expect(rig.controls.target.distanceTo(target)).toBeLessThan(1e-8)
    expect(camera.position.distanceTo(target)).toBeCloseTo(offset.length(), 8)
  })
  it('keyboard orbit/pan/zoom/home/confirm are shared and ignore child inputs', () => {
    const { host, camera, rig, home, confirm } = setup(up()), before = camera.position.clone()
    const key = (key: string, shiftKey = false) => host.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey }))
    key('ArrowRight'); expect(camera.position.distanceTo(before)).toBeGreaterThan(0)
    key('ArrowRight', true); expect(rig.controls.target.length()).toBeGreaterThan(0)
    const distance = camera.position.distanceTo(rig.controls.target); key('+'); expect(camera.position.distanceTo(rig.controls.target)).toBeLessThan(distance)
    key('Home'); key('Enter'); expect(home).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledOnce()
    const input = document.createElement('input'); host.append(input)
    const target = rig.controls.target.clone(); input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', shiftKey: true }))
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
