import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HudCardShell } from './HudCardShell'

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


it('keeps mobile dismissal and navigation outside its content scroll viewport', () => {
  const close = vi.fn()
  render(<HudCardShell title="Objects" lighting="none" onClose={close} toolbar={<nav aria-label="Panels">Objects / Arrange</nav>}><input aria-label="Search" /></HudCardShell>)
  const content = screen.getByLabelText('Search').closest('[data-slot="hud-content"]')!
  expect(content).not.toContainElement(screen.getByRole('button', { name: 'Close card' }))
  expect(content).not.toContainElement(screen.getByRole('navigation', { name: 'Panels' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close card' }))
  expect(close).toHaveBeenCalledOnce()
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
