import { afterEach, expect, it, vi } from 'vitest'
import { bindMapBrowserGestures } from './map-browser-gestures'

let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); document.body.replaceChildren() })
function fixture() {
  const host = document.createElement('div'), label = document.createElement('span'), control = document.createElement('button'), outside = document.createElement('div')
  control.dataset.spaceCameraControl = ''; host.append(label, control); document.body.append(host, outside)
  cleanup = bindMapBrowserGestures(host)
  return { host, label, control, outside }
}
function touch(target: Element, type: string, targets: EventTarget[] = [target], cancelable = true) {
  const event = new Event(type, { bubbles: true, cancelable })
  Object.defineProperty(event, 'touches', { value: targets.map((target, identifier) => ({ target, identifier })) })
  target.dispatchEvent(event)
  return event
}
it('cancels the first map touch synchronously, move, and Safari gestures only while the map owns touches', () => {
  const { label } = fixture()
  expect(touch(label, 'touchstart').defaultPrevented).toBe(true)
  expect(touch(label, 'touchmove').defaultPrevented).toBe(true)
  for (const type of ['gesturestart', 'gesturechange']) {
    const event = new Event(type, { bubbles: true, cancelable: true }); document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  expect(touch(label, 'touchend', []).defaultPrevented).toBe(true)
  const after = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(after)
  expect(after.defaultPrevented).toBe(false)
})
it('leaves controls and touches that begin outside the map available to the browser', () => {
  const { label, control, outside, host } = fixture()
  expect(touch(control, 'touchstart').defaultPrevented).toBe(false)
  expect(touch(label, 'touchstart', [outside, label]).defaultPrevented).toBe(false)
  host.setAttribute('inert', '')
  expect(touch(label, 'touchstart').defaultPrevented).toBe(false)
  host.removeAttribute('inert')
  expect(touch(label, 'touchstart').defaultPrevented).toBe(true)
})
it('installs nonpassive capture listeners before the first touch and cleans up cancellation/blur', () => {
  const { host, label } = fixture()
  const spy = vi.spyOn(host, 'addEventListener')
  cleanup?.(); cleanup = bindMapBrowserGestures(host)
  expect(spy).toHaveBeenCalledWith('touchstart', expect.any(Function), { capture: true, passive: false })
  expect(spy).toHaveBeenCalledWith('touchmove', expect.any(Function), { capture: true, passive: false })
  touch(label, 'touchstart'); touch(label, 'touchcancel', [])
  let gesture = new Event('gesturechange', { cancelable: true }); document.dispatchEvent(gesture); expect(gesture.defaultPrevented).toBe(false)
  touch(label, 'touchstart'); window.dispatchEvent(new Event('blur'))
  gesture = new Event('gesturechange', { cancelable: true }); document.dispatchEvent(gesture); expect(gesture.defaultPrevented).toBe(false)
  cleanup?.(); cleanup = undefined
  expect(touch(label, 'touchstart').defaultPrevented).toBe(false)
  spy.mockRestore()
})
