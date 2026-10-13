import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { CameraRig } from './camera-rig'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('galaxy camera scheduling', () => {
  it('Scenario: Animation does not block navigation — externally stepped focus owns no second drawing loop', () => {
    const raf = vi.fn(() => 41)
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const wrapper = document.createElement('div')
    const canvas = document.createElement('canvas')
    wrapper.append(canvas)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000)
    camera.position.set(10, -20, 30)
    const rig = new CameraRig(camera, canvas, wrapper, null, false)
    const original = camera.position.clone()
    const target = new THREE.Vector3(100, 50, 0)
    try {
      expect(raf).not.toHaveBeenCalled()
      rig.focus(target, 600)
      // An owner suspended during backend initialization/loss does not advance
      // the camera until its single external presentation loop steps the rig.
      now = 300
      expect(camera.position.distanceTo(original)).toBeLessThan(0.000001)
      rig.update()
      expect(rig.controls.target.distanceTo(target.clone().multiplyScalar(0.5))).toBeLessThan(0.000001)
      now = 600
      rig.update()
      expect(rig.controls.target.distanceTo(target)).toBeLessThan(0.000001)
      expect(camera.position.distanceTo(original.clone().add(target))).toBeLessThan(0.000001)
      expect(raf).not.toHaveBeenCalled()
      const update = vi.spyOn(rig.controls, 'update')
      rig.dispose()
      rig.update()
      expect(update).not.toHaveBeenCalled()
    } finally {
      rig.dispose()
    }
  })

  it('SDET-added: default camera scheduling releases its pending frame and wheel listener on departure', () => {
    const raf = vi.fn(() => 41)
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const wrapper = document.createElement('div')
    const canvas = document.createElement('canvas')
    wrapper.append(canvas)
    const remove = vi.spyOn(wrapper, 'removeEventListener')
    const rig = new CameraRig(new THREE.PerspectiveCamera(), canvas, wrapper, null)
    const release = vi.spyOn(rig.controls, 'dispose')
    expect(raf).toHaveBeenCalledTimes(1)
    rig.dispose()
    expect(cancel).toHaveBeenCalledWith(41)
    expect(release).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith('wheel', expect.any(Function), { capture: true })
  })
})
