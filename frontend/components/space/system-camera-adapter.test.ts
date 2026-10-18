import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSystemCameraAdapter } from './system-camera-adapter'
import { defaultCamera, fleetCamera, panBound, zoomRange } from './space-camera'
import { viewBasisOf } from './space-projection'
const disposals: (() => void)[] = []
afterEach(() => disposals.splice(0).forEach(dispose => dispose()))
function setup(initial = defaultCamera(100)) {
  const host = document.createElement('div'); document.body.append(host)
  Object.defineProperties(host, { clientWidth: { value: 1200 }, clientHeight: { value: 900 } })
  const onChange = vi.fn(), home = vi.fn(), confirm = vi.fn()
  const adapter = createSystemCameraAdapter(host, 100, initial, { onChange, onHome: home, onConfirm: confirm })
  disposals.push(() => { adapter.dispose(); host.remove() })
  return { host, adapter, onChange }
}
describe('System coordinate adapter for the shared camera', () => {
  it('preserves an untouched camera exactly and does not publish React updates while stepping', () => {
    const initial = defaultCamera(100), { adapter, onChange } = setup(initial)
    let frame = initial
    for (let i = 0; i < 100; i++) frame = adapter.step(frame)
    expect(frame).toEqual(initial); expect(viewBasisOf(frame, { width: 1200, height: 900 })).toEqual(viewBasisOf(initial, { width: 1200, height: 900 }))
    expect(onChange).not.toHaveBeenCalled()
  })
  it('follows the resolved fleet frame, retains following on orbit/zoom and releases it on pan', () => {
    const initial = fleetCamera(100, 'fleet', { x: 5, y: 2, z: 3 }), { adapter, host, onChange } = setup(initial)
    const followed = { ...initial, target: { x: 20, y: 2, z: 10 }, distance: 40 }
    expect(adapter.step(followed).target).toEqual(followed.target)
    host.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
    expect(onChange.mock.calls.at(-1)?.[0].followFleetId).toBe('fleet')
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 }))
    expect(onChange.mock.calls.at(-1)?.[0].followFleetId).toBe('fleet')
    host.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }))
    expect(onChange.mock.calls.at(-1)?.[0].followFleetId).toBeUndefined()
  })
  it('applies scene limits without a second gesture implementation', () => {
    const { adapter, host, onChange } = setup(), range = zoomRange(100)
    for (let i = 0; i < 200; i++) host.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '+' }))
    expect(onChange.mock.calls.at(-1)?.[0].distance).toBeCloseTo(range.min)
    for (let i = 0; i < 500; i++) host.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', shiftKey: true }))
    const state = onChange.mock.calls.at(-1)?.[0]
    expect(Math.hypot(state.target.x, state.target.y, state.target.z)).toBeCloseTo(panBound(100))
    expect(adapter.rig.controls.screenSpacePanning).toBe(false)
    expect(adapter.rig.controls.minDistance).toBe(range.min)
  })
})
