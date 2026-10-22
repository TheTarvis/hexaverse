import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HudCardBack, HudCardShell } from './HudCardShell'

const renderer = vi.hoisted(() => ({
  failInit: false,
  entries: [] as { render: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
}))

vi.mock('@/components/render-guard/renderer-candidate', () => ({
  createRendererCandidate: (options: { canvas: HTMLCanvasElement }) => {
    const entry = { render: vi.fn(async () => {}), dispose: vi.fn() }
    renderer.entries.push(entry)
    return {
      ...entry,
      canvas: options.canvas,
      init: async () => { if (renderer.failInit) throw new Error('Renderer unavailable') },
      backend: () => 'webgpu',
      resize: vi.fn(),
      setClearColor: vi.fn(),
      onLoss: () => () => {},
    }
  },
}))

let frames: Map<number, FrameRequestCallback>
let motion: EventTarget & { matches: boolean }

it('measures shared title overflow again on resize and keeps the full accessible title', () => {
  let resize = () => {}
  const disconnect = vi.fn()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback }
    observe() {}
    disconnect = disconnect
  })
  const title = 'Peregrine · Mining at Nereid outer belt'
  const { unmount } = render(<HudCardShell title={{ fleet: 'Peregrine', action: 'mining', object: 'Nereid outer belt' }} lighting="none" />)
  const heading = screen.getByRole('heading', { name: title })
  const viewport = heading.firstElementChild!
  const text = viewport.firstElementChild!
  let available = 180
  Object.defineProperty(viewport, 'clientWidth', { get: () => available })
  Object.defineProperty(text, 'scrollWidth', { get: () => 360 })
  act(() => resize())
  expect(heading).toHaveAttribute('data-scrolling', 'true')
  expect(heading.style.getPropertyValue('--title-travel')).toBe('-180px')
  available = 420
  act(() => resize())
  expect(heading).toHaveAttribute('data-scrolling', 'false')
  expect(heading).toHaveAttribute('title', title)
  unmount()
  expect(disconnect).toHaveBeenCalledOnce()
})

beforeEach(() => {
  renderer.entries = []
  renderer.failInit = false
  frames = new Map()
  let nextFrame = 0
  motion = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', (query: string) => query.includes('reduced-motion')
    ? motion : Object.assign(new EventTarget(), { matches: false }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id) })
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe() { this.callback([{ isIntersecting: true }]) }
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 320, 200))
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function frame(now: number) {
  await act(async () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
  })
}

describe('HUD card foundation', () => {
  it('keeps content and dismissal usable before the first decorative frame', async () => {
    const close = vi.fn()
    const view = render(<HudCardShell title="Inspector" onClose={close}><p>Fleet details</p></HudCardShell>)
    expect(screen.getByRole('region', { name: 'Inspector' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
    expect(close).toHaveBeenCalledOnce()
    expect(screen.getByText('Fleet details')).toBeVisible()
    await waitFor(() => expect(renderer.entries).toHaveLength(1))
    expect(renderer.entries[0].render).not.toHaveBeenCalled()
    view.unmount()
    expect(renderer.entries[0].dispose).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('offers a plain shell without initializing a renderer', async () => {
    render(<HudCardShell lighting="none" title="Quick actions">Content</HudCardShell>)
    await act(async () => {})
    expect(renderer.entries).toHaveLength(0)
    expect(document.querySelector('canvas')).toBeNull()
  })

  it('retains content and dismissal when both renderer backends are unavailable', async () => {
    renderer.failInit = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const close = vi.fn()
    render(<HudCardShell title="Inspector" onClose={close}>Fleet details</HudCardShell>)
    await waitFor(() => expect(renderer.entries).toHaveLength(2))
    expect(screen.getByText('Fleet details')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
    expect(close).toHaveBeenCalledOnce()
    expect(renderer.entries.every(entry => entry.render.mock.calls.length === 0)).toBe(true)
  })

  it('presents a static reduced-motion frame and resumes when the preference changes', async () => {
    motion.matches = true
    render(<HudCardShell title="Inspector" />)
    await waitFor(() => expect(renderer.entries).toHaveLength(1))
    await frame(16)
    await frame(32)
    expect(renderer.entries[0].render).toHaveBeenCalled()
    expect(frames.size).toBe(0)
    act(() => { motion.matches = false; motion.dispatchEvent(new Event('change')) })
    await frame(64)
    expect(frames.size).toBe(1)
  })

  it('stops scheduling while hidden and resumes on return', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get')
    render(<HudCardShell title="Inspector" />)
    await waitFor(() => expect(renderer.entries).toHaveLength(1))
    await frame(16)
    expect(frames.size).toBe(1)
    act(() => { hidden.mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange')) })
    expect(frames.size).toBe(0)
    const count = renderer.entries[0].render.mock.calls.length
    act(() => { hidden.mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange')) })
    await frame(10000)
    expect(renderer.entries[0].render.mock.calls.length).toBeGreaterThan(count)
  })
})

it('shares one frame with nested content and leaves dismissal to the owning frame', async () => {
  const close = vi.fn()
  render(<HudCardShell title="Command" lighting="none"><HudCardShell title="Travel review" onClose={close} closeLabel="Back to commands"><input aria-label="Retained draft" /></HudCardShell></HudCardShell>)
  const owner = screen.getByRole('region', { name: 'Command' })
  const content = screen.getByRole('region', { name: 'Travel review' })
  expect(owner).toHaveAttribute('data-hud-framing', 'frame')
  expect(content).toHaveAttribute('data-hud-framing', 'section')
  expect(owner.querySelectorAll('[data-hud-framing="frame"]')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Retained draft'), { target: { value: 'Keep this' } })
  expect(screen.queryByRole('button', { name: 'Back to commands' })).toBeNull()
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Retained draft')).toHaveValue('Keep this')
  await act(async () => {})
  expect(renderer.entries).toHaveLength(0)
})

it('allows detached overlays to explicitly own a frame and respects an explicit accessible name', () => {
  render(<HudCardShell title="Command" lighting="none"><HudCardShell framing="frame" title="Fleet" aria-label="Fleet details" lighting="none">Details</HudCardShell></HudCardShell>)
  expect(screen.getByRole('region', { name: 'Fleet details' })).toHaveAttribute('data-hud-framing', 'frame')
})

it('puts nested task Back beside the owning frame Close and preserves its disabled guard', () => {
  const back = vi.fn(), close = vi.fn()
  const card = (disabled: boolean) => <HudCardShell title="Objects" lighting="none" onClose={close}>
    <HudCardShell title="Travel"><HudCardBack destination="objects" onClick={back} disabled={disabled} /><input aria-label="Trip draft" defaultValue="Keep" /></HudCardShell>
  </HudCardShell>
  const view = render(card(false))
  const control = screen.getByRole('button', { name: 'Back to objects' })
  const navigation = control.closest('[data-slot="hud-card-navigation"]')!
  expect(navigation).toContainElement(screen.getByRole('button', { name: 'Close card' }))
  expect(screen.getByLabelText('Trip draft').closest('[data-slot="hud-content"]')).not.toContainElement(control)
  fireEvent.click(control)
  expect(back).toHaveBeenCalledOnce()
  view.rerender(card(true))
  expect(screen.getByRole('button', { name: 'Back to objects' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Back to objects' }))
  expect(back).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
  expect(close).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Trip draft')).toHaveValue('Keep')
})


it('keeps mobile dismissal and navigation outside its content scroll viewport', () => {
  const close = vi.fn()
  render(<HudCardShell title="Objects" lighting="none" onClose={close} toolbar={<nav aria-label="Panels">Objects / Arrange</nav>}><input aria-label="Search" /></HudCardShell>)
  const content = screen.getByLabelText('Search').closest('[data-slot="hud-content"]')!
  expect(content).not.toContainElement(screen.getByRole('button', { name: 'Close card' }))
  expect(content).not.toContainElement(screen.getByRole('navigation', { name: 'Panels' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
  expect(close).toHaveBeenCalledOnce()
})

it('keeps header and footer outside scrolling content without remounting a draft when slots change', () => {
  const draft = <input aria-label="Mining quantity" defaultValue="24" />
  const view = render(<HudCardShell title="Mining" lighting="none">{draft}</HudCardShell>)
  const input = screen.getByLabelText('Mining quantity')
  fireEvent.change(input, { target: { value: '48' } })
  view.rerender(<HudCardShell title="Mining" lighting="none" header={<nav aria-label="Mining navigation">Back to resource</nav>} footer={<button>Start mining</button>}>{draft}</HudCardShell>)
  const content = input.closest('[data-slot="hud-content"]')!
  expect(content).not.toContainElement(screen.getByRole('navigation', { name: 'Mining navigation' }))
  expect(content).not.toContainElement(screen.getByRole('button', { name: 'Start mining' }))
  expect(screen.getByLabelText('Mining quantity')).toBe(input)
  view.rerender(<HudCardShell title="Mining" lighting="none" header="Mining started">{draft}</HudCardShell>)
  expect(screen.getByLabelText('Mining quantity')).toBe(input)
  expect(input).toHaveValue('48')
})

it('bounds submissions for multiple visible owners and releases all renderers on departure', async () => {
  const view = render(<>{['Objects', 'Command', 'Console'].map(title => <HudCardShell key={title} title={title}>Panel</HudCardShell>)}</>)
  await waitFor(() => expect(renderer.entries).toHaveLength(3))
  for (let now = 16; now <= 2016; now += 16) await frame(now)
  expect(renderer.entries).toHaveLength(3)
  for (const entry of renderer.entries) {
    expect(entry.render.mock.calls.length).toBeGreaterThan(0)
    expect(entry.render.mock.calls.length).toBeLessThanOrEqual(61)
  }
  act(() => { motion.matches = true; motion.dispatchEvent(new Event('change')) })
  await frame(3000)
  expect(frames.size).toBe(0)
  const counts = renderer.entries.map(entry => entry.render.mock.calls.length)
  await frame(4000)
  expect(renderer.entries.map(entry => entry.render.mock.calls.length)).toEqual(counts)
  view.unmount()
  expect(renderer.entries.every(entry => entry.dispose.mock.calls.length === 1)).toBe(true)
  expect(frames.size).toBe(0)
})
