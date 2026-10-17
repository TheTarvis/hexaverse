import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { bindSystemViewport } from './system-viewport-lock'

let release: (() => void) | undefined
let mediaChange: (() => void) | undefined
const media = { matches: true, addEventListener: vi.fn((_name, listener) => { mediaChange = listener }), removeEventListener: vi.fn() }
let viewport: EventTarget & { height: number; width: number; offsetTop: number; scale: number }
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue(media); media.matches = true
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 })
  viewport = Object.assign(new EventTarget(), { height: 700, width: 390, offsetTop: 0, scale: 1 })
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
})
afterEach(() => { release?.(); release = undefined; document.body.replaceChildren(); document.body.removeAttribute('style'); document.documentElement.removeAttribute('style'); vi.restoreAllMocks() })
function fixture() {
  const root = document.createElement('div'), map = document.createElement('canvas'), button = document.createElement('button'), scroll = document.createElement('div'), content = document.createElement('span')
  root.append(map, button, scroll); scroll.append(content); scroll.style.overflowY = 'auto'; document.body.append(root)
  Object.defineProperties(scroll, { clientHeight: { value: 100 }, scrollHeight: { value: 500 } })
  release = bindSystemViewport(root)
  return { root, map, button, scroll, content }
}
function touch(target: Element, type: string, x = 100, y = 100, count = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, (_, identifier) => ({ identifier, target, clientX: x + identifier * 40, clientY: y })) })
  target.dispatchEvent(event); return event
}
it('locks both document roots, uses visual viewport height and restores exact owned styles on route exit', () => {
  document.body.style.setProperty('position', 'relative', 'important'); document.body.style.overflowY = 'scroll'
  document.documentElement.style.height = '90%'
  const { root } = fixture()
  expect(document.body.style.position).toBe('fixed'); expect(document.documentElement.style.overflow).toBe('hidden')
  expect(root.style.height).toBe('700px'); expect(document.documentElement.style.getPropertyValue('--system-viewport-bottom')).toBe('144px')
  release?.(); release = undefined
  expect(document.body.style.position).toBe('relative'); expect(document.body.style.getPropertyPriority('position')).toBe('important'); expect(document.body.style.overflowY).toBe('scroll')
  expect(document.documentElement.style.height).toBe('90%'); expect(document.documentElement.hasAttribute('data-system-scroll-lock')).toBe(false)
  expect(root.style.position).toBe('')
  expect(touch(root, 'touchstart').defaultPrevented).toBe(false)
})
it('claims empty/HUD drag starts while keeping native button taps and editable fields available', () => {
  const { map, button, root } = fixture()
  expect(touch(map, 'touchstart').defaultPrevented).toBe(true)
  touch(map, 'touchend', 100, 100, 0)
  expect(touch(button, 'touchstart').defaultPrevented).toBe(false)
  expect(touch(button, 'touchmove', 100, 130).defaultPrevented).toBe(true)
  const input = document.createElement('input'); root.append(input)
  expect(touch(input, 'touchstart').defaultPrevented).toBe(false)
  expect(touch(input, 'touchmove', 130, 100).defaultPrevented).toBe(false)
})
it('allows card scroll in available directions but blocks chaining at top/bottom and after card close', () => {
  const { content, scroll, map } = fixture()
  expect(touch(content, 'touchstart').defaultPrevented).toBe(false)
  expect(touch(content, 'touchmove', 100, 130).defaultPrevented).toBe(true)
  scroll.scrollTop = 200
  expect(touch(content, 'touchmove', 100, 150).defaultPrevented).toBe(false)
  scroll.scrollTop = 400
  expect(touch(content, 'touchmove', 100, 120).defaultPrevented).toBe(true)
  touch(content, 'touchend', 100, 100, 0); scroll.remove()
  expect(touch(map, 'touchstart').defaultPrevented).toBe(true)
})
it('does not cancel browser pinch outside the map and does not fight accessibility viewport zoom', () => {
  const { button, root } = fixture()
  expect(touch(button, 'touchstart', 100, 100, 2).defaultPrevented).toBe(false)
  expect(touch(button, 'touchmove', 100, 130, 2).defaultPrevented).toBe(false)
  viewport.scale = 2; viewport.height = 350; viewport.offsetTop = 100; viewport.dispatchEvent(new Event('resize'))
  expect(root.style.height).toBe('700px')
  expect(touch(button, 'touchstart').defaultPrevented).toBe(false)
  expect(touch(button, 'touchmove', 100, 130).defaultPrevented).toBe(false)
})
it('keeps the lock when a modal restores body styles, resizes visible bounds and cleans up on desktop exit', async () => {
  const { root } = fixture()
  document.body.style.removeProperty('position')
  await Promise.resolve(); expect(document.body.style.position).toBe('fixed')
  viewport.height = 600; viewport.offsetTop = 20; viewport.dispatchEvent(new Event('resize'))
  expect(root.style.height).toBe('600px'); expect(root.style.top).toBe('0px')
  const input = document.createElement('input'); root.append(input); input.focus(); viewport.dispatchEvent(new Event('resize'))
  expect(root.style.top).toBe('20px')
  media.matches = false; mediaChange?.()
  expect(document.body.style.position).toBe(''); expect(root.style.height).toBe('')
})
