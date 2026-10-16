import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RendererCandidateFactory } from '@/components/render-guard/renderer-candidate'

const controllers = vi.hoisted(() => ({ calls: [] as { kind: string; setAccentColor: ReturnType<typeof vi.fn>; status: (status: string) => void; resize: ReturnType<typeof vi.fn>; rotate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[] }))
vi.mock('./webgl/spacecraft-preview', async () => {
  const THREE = await import('three')
  return { createSpacecraftPreviewScene: (_context: unknown, { kind, onAssetStatus: status }: { kind: string; onAssetStatus: (status: string) => void }) => {
  const c = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), kind, status, setAccentColor: vi.fn(), resize: vi.fn(), rotate: vi.fn(), reset: vi.fn(), dispose: vi.fn() }
  controllers.calls.push(c); status('loading'); return c
} } })
const observers: { disconnect: ReturnType<typeof vi.fn>; callback: ResizeObserverCallback }[] = []
interface Props { kind: 'ship' | 'station'; objectId: string; label: string; accentColor: number; rendererFactory?: RendererCandidateFactory }
let frames: FrameRequestCallback[]
async function flushCanvas() {
  await act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
  const pending = frames.splice(0)
  await act(async () => { pending.forEach(callback => callback(100)) })
}
const rendererFactory: RendererCandidateFactory = options => ({ canvas: options.canvas, init: async () => {}, backend: () => 'webgpu', render: () => {}, resize: () => {}, setClearColor: () => {}, onLoss: () => () => {}, dispose: () => {} })
async function component() {
  const path = './SpacecraftPreview'
  const exports = await import(/* @vite-ignore */ path).catch(() => null) as { SpacecraftPreview: React.ComponentType<Props> } | null
  expect(exports, 'Contracted preview React component exists').not.toBeNull()
  return exports!.SpacecraftPreview
}
beforeEach(() => {
  controllers.calls = []; observers.length = 0
  frames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('matchMedia', () => Object.assign(new EventTarget(), { matches: false }))
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn()
    constructor(callback: ResizeObserverCallback) { observers.push({ disconnect: this.disconnect, callback }) }
    observe() {}
    unobserve() {}
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const props: Props = { kind: 'ship', objectId: 'fleet-one', label: 'fleet-one', accentColor: 0x4ade80, rendererFactory }
const surface = () => screen.getByLabelText('3D preview of fleet-one')

describe('SpacecraftPreview controls and lifecycle', () => {
  it('Scenario: Keyboard orientation and focus exit — arrows Home reset and ordinary tab navigation', async () => {
    const Preview = await component(), parent = vi.fn()
    render(<div onKeyDown={parent}><Preview {...props} /><button>Next detail control</button></div>)
    await flushCanvas()
    const control = surface(), c = controllers.calls[0]!
    expect(control.tabIndex).toBeGreaterThanOrEqual(0)
    expect(control.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(control.getAttribute('aria-describedby')!)).toHaveTextContent(/drag/i)
    expect(document.getElementById(control.getAttribute('aria-describedby')!)).toHaveTextContent(/arrow/i)
    // Visible focus must be explicitly styled on the keyboard interaction surface.
    expect(control.className).toMatch(/focus/)
    control.focus()
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) fireEvent.keyDown(control, { key })
    expect(c.rotate.mock.calls).toEqual([[-Math.PI / 12, 0], [Math.PI / 12, 0], [0, -Math.PI / 12], [0, Math.PI / 12]])
    fireEvent.keyDown(control, { key: 'Home' }); expect(c.reset).toHaveBeenCalledTimes(1)
    expect(parent).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(c.reset).toHaveBeenCalledTimes(2)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Next detail control' })).toHaveFocus()
    parent.mockClear() // Tab intentionally bubbles to preserve ordinary navigation.
    fireEvent.keyDown(control, { key: 'Escape' }); expect(parent).toHaveBeenCalledTimes(1)
  })
  it('Scenario: Pointer rotation and reset — captured drag, cancellation and host isolation', async () => {
    const Preview = await component(), map = vi.fn()
    render(<div onPointerDown={map} onPointerMove={map} onPointerUp={map} onClick={map} onWheel={map}><Preview {...props} /></div>)
    await flushCanvas()
    const control = surface(), c = controllers.calls[0]!
    control.setPointerCapture = vi.fn(); control.releasePointerCapture = vi.fn(); control.hasPointerCapture = vi.fn(() => true)
    fireEvent.pointerDown(control, { pointerId: 7, isPrimary: true, button: 0, clientX: 10, clientY: 20 })
    expect(control.setPointerCapture).toHaveBeenCalledWith(7)
    fireEvent.pointerMove(control, { pointerId: 7, isPrimary: true, clientX: 30, clientY: 50 })
    expect(c.rotate).toHaveBeenLastCalledWith(0.2, 0.3)
    fireEvent.pointerCancel(control, { pointerId: 7 })
    fireEvent.pointerMove(control, { pointerId: 7, clientX: 90, clientY: 90 })
    expect(c.rotate).toHaveBeenCalledTimes(1)
    fireEvent.click(control); fireEvent.wheel(control, { deltaY: 20 })
    expect(map).not.toHaveBeenCalled()
    expect(control.style.touchAction || getComputedStyle(control).touchAction).toBe('none')
  })
  it('Scenario: Delayed preview load / Failed asset or unavailable rendering — status scoped to preview', async () => {
    const Preview = await component()
    render(<div><h3>fleet-one</h3><Preview {...props} /><button>Existing action</button></div>)
    await flushCanvas()
    expect(screen.getByRole('status')).toHaveTextContent(/loading/i)
    expect(screen.getByRole('button', { name: 'Existing action' })).toBeEnabled()
    act(() => controllers.calls[0]!.status('fallback'))
    expect(screen.getByRole('status')).toHaveTextContent(/simplified/i)
    expect(screen.getByRole('heading', { name: 'fleet-one' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Existing action' })).toBeEnabled()
  })
  it('Scenario: Closing or hiding a retained panel / Entity change and late completion — release controller and observer', async () => {
    const Preview = await component()
    const h = render(<Preview {...props} />)
    await flushCanvas()
    expect(controllers.calls).toHaveLength(1)
    expect(observers).toHaveLength(1)
    h.rerender(<Preview {...props} objectId="fleet-two" label="fleet-two" />)
    await flushCanvas()
    expect(controllers.calls[0]!.dispose).toHaveBeenCalledTimes(1)
    expect(controllers.calls).toHaveLength(2)
    expect(screen.getByLabelText('3D preview of fleet-two')).toBeInTheDocument()
    h.unmount()
    for (const c of controllers.calls) expect(c.dispose).toHaveBeenCalledTimes(1)
    for (const o of observers) expect(o.disconnect).toHaveBeenCalledTimes(1)
  })
})


// Authorized amendment: changing served mode color cannot remount the same
// entity's preview, erase accepted rotation or issue another local asset load.
it('Scenario: No autonomous rotation — same entity accent update keeps controller session', async () => {
  const Preview = await component()
  const h = render(<Preview {...props} />)
  await flushCanvas()
  const c = controllers.calls[0]!
  fireEvent.keyDown(surface(), { key: 'ArrowRight' })
  expect(c.rotate).toHaveBeenCalledWith(Math.PI / 12, 0)
  h.rerender(<Preview {...props} accentColor={0xffb454} />)
  expect(controllers.calls).toHaveLength(1)
  expect(c.dispose).not.toHaveBeenCalled()
  expect(c.setAccentColor).toHaveBeenLastCalledWith(0xffb454)
  expect(c.reset).not.toHaveBeenCalled()
  h.unmount(); expect(c.dispose).toHaveBeenCalledTimes(1)
})
