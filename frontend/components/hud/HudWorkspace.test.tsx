import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { HudCardShell } from './HudCardShell'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'

const key = (corporation: string) => `hexaverse:hud-layout:v1:${corporation}`
let saved: Map<string, string>
const panels: HudWorkspacePanel[] = [
  { id: 'objects', label: 'Objects', children: <input aria-label="Object search" defaultValue="" /> },
  { id: 'command', label: 'Command', children: <><button>Review course</button><input aria-label="Command draft" defaultValue="" /></> },
]
beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  saved = new Map()
  vi.mocked(window.localStorage.getItem).mockImplementation(name => saved.get(name) ?? null)
  vi.mocked(window.localStorage.setItem).mockReset().mockImplementation((name, value) => { saved.set(name, value) })
  vi.mocked(window.localStorage.removeItem).mockReset().mockImplementation(name => { saved.delete(name) })
})
function settings() { fireEvent.click(screen.getByRole('button', { name: 'Arrange HUD' })) }

it('hydrates saved preferences without overwriting them, and isolates corporations', async () => {
  const original = JSON.stringify([{ id: 'objects', lane: 'right', visible: false }])
  saved.set(key('one'), original)
  const view = render(<HudWorkspace corporationId="one" panels={panels} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Objects (hidden)' })).toBeEnabled())
  expect(screen.getByLabelText('Object search', { selector: 'input' })).not.toBeVisible()
  expect(window.localStorage.setItem).not.toHaveBeenCalled()
  view.rerender(<HudWorkspace corporationId="two" panels={panels} />)
  expect(screen.getByLabelText('Object search')).toBeVisible()
  settings()
  fireEvent.click(screen.getByRole('button', { name: 'Show Command' }))
  expect(saved.get(key('one'))).toBe(original)
  expect(JSON.parse(saved.get(key('two'))!)).toContainEqual({ id: 'command', lane: 'right', visible: false })
})

it('keeps child input state mounted through hide, show and dock changes', () => {
  render(<HudWorkspace corporationId="one" panels={panels} />)
  const input = screen.getByLabelText('Object search')
  fireEvent.change(input, { target: { value: 'Borealis' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
  expect(input).toBeInTheDocument(); expect(input).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Arrange HUD' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Objects (hidden)' }))
  expect(input).toBeVisible(); expect(input).toHaveValue('Borealis')
  settings()
  fireEvent.click(screen.getByRole('button', { name: 'Move Objects to right' }))
  expect(screen.getByLabelText('Object search')).toBe(input)
  expect(input).toHaveValue('Borealis')
  expect(JSON.parse(saved.get(key('one'))!)).toContainEqual({ id: 'objects', lane: 'right', visible: true })
})

it('orders panels using keyboard-accessible controls and announces the change', () => {
  const view = render(<HudWorkspace corporationId="one" panels={panels} />)
  settings()
  fireEvent.click(screen.getByRole('button', { name: 'Move Objects to left' }))
  expect(window.localStorage.setItem).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Move Command to left' }))
  fireEvent.click(screen.getByRole('button', { name: 'Move Command up' }))
  expect(Array.from(view.container.querySelectorAll('[data-panel][data-lane="left"]')).map(panel => panel.getAttribute('data-panel'))).toEqual(['command', 'objects'])
  expect(screen.getByRole('status')).toHaveTextContent('Command moved up.')
  expect(screen.getByRole('button', { name: 'Move Command up' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Move Command down' }))
  expect(Array.from(view.container.querySelectorAll('[data-panel][data-lane="left"]')).map(panel => panel.getAttribute('data-panel'))).toEqual(['objects', 'command'])
})

it.each(['broken JSON', JSON.stringify([{ id: 'alien', lane: 'right', visible: false }, { id: 'objects', lane: 'somewhere', visible: false }])])('recovers malformed storage safely without writing during hydration', raw => {
  saved.set(key('one'), raw)
  render(<HudWorkspace corporationId="one" panels={panels} />)
  expect(screen.getByLabelText('Object search')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Objects' })).toHaveAttribute('aria-pressed', 'true')
  expect(window.localStorage.setItem).not.toHaveBeenCalled()
})

it('ignores duplicate entries and preserves valid preferences while restoring missing panels', () => {
  saved.set(key('one'), JSON.stringify([
    { id: 'objects', lane: 'right', visible: false },
    { id: 'objects', lane: 'left', visible: true },
    { id: 'not-a-panel', lane: 'left', visible: false },
  ]))
  render(<HudWorkspace corporationId="one" panels={panels} />)
  expect(screen.getByLabelText('Object search')).not.toBeVisible()
  expect(screen.getByRole('button', { name: 'Command' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Command' })).toBeInTheDocument()
})

it('restores defaults and removes only the current corporation layout key', () => {
  saved.set(key('other'), 'keep-me')
  saved.set('session', 'keep-session')
  render(<HudWorkspace corporationId="one" panels={panels} />)
  settings()
  for (const label of ['Objects', 'Command']) fireEvent.click(screen.getByRole('button', { name: `Show ${label}` }))
  expect(screen.getByRole('button', { name: 'Arrange HUD' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Reset HUD layout' }))
  expect(screen.getByLabelText('Object search')).toBeVisible()
  expect(window.localStorage.removeItem).toHaveBeenCalledExactlyOnceWith(key('one'))
  expect(saved.get(key('one'))).toBeUndefined()
  expect(saved.get(key('other'))).toBe('keep-me'); expect(saved.get('session')).toBe('keep-session')
})

it('closes settings with Escape and restores recovery-control focus', () => {
  render(<HudWorkspace corporationId="one" panels={panels} />)
  settings()
  const button = screen.getByRole('button', { name: 'Move Objects to right' })
  button.focus(); fireEvent.keyDown(button, { key: 'Escape' })
  expect(screen.queryByRole('button', { name: 'Reset HUD layout' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Arrange HUD' })).toHaveFocus()
})

it('reveals and activates requested panels, repeats focus without losing mounted draft state', async () => {
  const view = render(<HudWorkspace corporationId="one" panels={panels} />)
  const draft = screen.getByLabelText('Command draft')
  fireEvent.change(draft, { target: { value: 'Hold position' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hide Command' }))
  view.rerender(<HudWorkspace corporationId="one" panels={panels} request={{ id: 'command', sequence: 1 }} />)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Command panel' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Command' })).toHaveAttribute('aria-pressed', 'true')
  expect(draft).toHaveValue('Hold position'); expect(draft).toBeVisible()
  screen.getByRole('button', { name: 'Arrange HUD' }).focus()
  view.rerender(<HudWorkspace corporationId="one" panels={panels} request={{ id: 'command', sequence: 2 }} />)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Command panel' })).toHaveFocus())
  expect(within(screen.getByRole('region', { name: 'Command panel' })).getByLabelText('Command draft')).toBe(draft)
})

it('allows transient layout changes when storage access is unavailable', () => {
  vi.mocked(window.localStorage.getItem).mockImplementation(() => { throw new Error('blocked') })
  vi.mocked(window.localStorage.setItem).mockImplementation(() => { throw new Error('blocked') })
  render(<HudWorkspace corporationId="one" panels={panels} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
  expect(screen.getByLabelText('Object search')).not.toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Preferences could not be saved')
})


it('lets a requested panel child own focus when its open event selects a tab', () => {
  function CommandChild({ sequence }: { sequence: number }) {
    const tab = useRef<HTMLButtonElement>(null)
    useEffect(() => { if (sequence) tab.current?.focus() }, [sequence])
    return <button ref={tab}>Orders tab</button>
  }
  function Host({ sequence }: { sequence: number }) {
    return <HudWorkspace corporationId="one" panels={panels.map(panel => panel.id === 'command' ? { ...panel, children: <CommandChild sequence={sequence} /> } : panel)} {...(sequence ? { request: { id: 'command' as const, sequence } } : {})} />
  }
  const view = render(<Host sequence={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide Command' }))
  view.rerender(<Host sequence={1} />)
  expect(screen.getByRole('button', { name: 'Orders tab' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Command' })).toHaveAttribute('aria-pressed', 'true')
})

it('does not steal focus moved elsewhere between a request and passive effect flush', () => {
  function Host({ sequence }: { sequence: number }) {
    const outside = useRef<HTMLButtonElement>(null)
    // Parent layout effects run after the workspace captures the request origin,
    // before passive reveal/focus work: the user has moved to another control.
    useLayoutEffect(() => { if (sequence) outside.current?.focus() }, [sequence])
    return <><button ref={outside}>Navigation</button><HudWorkspace corporationId="one" panels={panels} {...(sequence ? { request: { id: 'command' as const, sequence } } : {})} /></>
  }
  const view = render(<Host sequence={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide Command' }))
  view.rerender(<Host sequence={1} />)
  expect(screen.getByRole('button', { name: 'Navigation' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Command' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Command draft')).toBeVisible()
})

it('collapses the active phone drawer without hiding the panel or losing its draft', () => {
  render(<HudWorkspace corporationId="one" panels={panels} />)
  const draft = screen.getByLabelText('Object search')
  fireEvent.change(draft, { target: { value: 'Retain this search' } })
  fireEvent.click(screen.getByRole('button', { name: /^Objects$/ }))
  expect(screen.getByRole('button', { name: /^Objects$/ })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('region', { name: 'Objects panel' })).toHaveAttribute('data-mobile-active', 'false')
  expect(screen.getByRole('region', { name: 'Objects panel' })).not.toHaveAttribute('hidden')
  fireEvent.click(screen.getByRole('button', { name: /^Objects$/ }))
  expect(screen.getByRole('region', { name: 'Objects panel' })).toHaveAttribute('data-mobile-active', 'true')
  expect(draft).toHaveValue('Retain this search')
  expect(window.localStorage.setItem).not.toHaveBeenCalled()
})


it('uses a modal page sheet on phones, returns to map, and retains mounted drafts', () => {
  const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  try {
    render(<><button>Map action</button><HudWorkspace corporationId="phone" panels={panels} /></>)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Command$/ }))
    const sheet = screen.getByRole('dialog', { name: 'Command panel' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText('Map action').parentElement).not.toHaveAttribute('inert')
    expect(screen.getByText('Map action')).toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Close Command panel' })).toHaveFocus()
    fireEvent.change(screen.getByLabelText('Command draft'), { target: { value: 'Saved local draft' } })
    fireEvent.click(within(sheet).getByRole('button', { name: /^Objects$/ }))
    expect(screen.getByRole('dialog', { name: 'Objects panel' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /^Command$/ }))
    expect(screen.getByLabelText('Command draft')).toHaveValue('Saved local draft')
    fireEvent.click(screen.getByRole('button', { name: 'Close Command panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Map action')).not.toHaveAttribute('inert')
    expect(window.localStorage.setItem).not.toHaveBeenCalled()
  } finally { media.mockRestore() }
})

it('closes phone settings to map with Escape and keeps layout edits', () => {
  const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  try {
    render(<HudWorkspace corporationId="phone" panels={panels} />)
    settings()
    expect(screen.getByRole('dialog', { name: 'Arrange HUD' })).toHaveAttribute('aria-modal', 'true')
    const move = screen.getByRole('button', { name: 'Move Command to left' })
    fireEvent.click(move); fireEvent.keyDown(move, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(JSON.parse(saved.get(key('phone'))!)).toContainEqual({ id: 'command', lane: 'left', visible: true })
    expect(screen.getByRole('button', { name: 'Arrange HUD' })).toHaveFocus()
  } finally { media.mockRestore() }
})


it('keeps phone focus in the page when a travel-like transition removes its focused action', async () => {
  const media = vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  function Journey() {
    const [started, setStarted] = useState(false)
    return started ? <p>Travelling</p> : <button onClick={() => setStarted(true)}>Start fixture trip</button>
  }
  try {
    render(<HudWorkspace corporationId="phone" panels={[{ id: 'command', label: 'Command', children: <Journey /> }]} />)
    fireEvent.click(screen.getByRole('button', { name: /^Command$/ }))
    const start = screen.getByRole('button', { name: 'Start fixture trip' })
    start.focus(); fireEvent.click(start)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close Command panel' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Close Command panel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Command' })).toHaveFocus()
  } finally { media.mockRestore() }
})

it('uses one shared frame per workspace panel and treats framed child cards as sections', () => {
  const children = panels.map(panel => ({ ...panel, children: <HudCardShell title={`${panel.label} content`} lighting="none">{panel.children}</HudCardShell> }))
  const view = render(<HudWorkspace corporationId="baseline" panels={children} />)
  for (const id of ['objects', 'command']) {
    const panel = view.container.querySelector(`[data-panel="${id}"]`)!
    expect(panel.querySelectorAll('[data-hud-framing="frame"]')).toHaveLength(1)
    expect(panel.querySelectorAll('[data-hud-framing="section"]')).toHaveLength(1)
  }
  const input = screen.getByLabelText('Object search')
  fireEvent.change(input, { target: { value: 'Retain me' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hide Objects' }))
  fireEvent.click(screen.getByRole('button', { name: 'Objects (hidden)' }))
  expect(screen.getByLabelText('Object search')).toBe(input)
  expect(input).toHaveValue('Retain me')
})

it('notifies the content owner when its phone panel is dismissed without unmounting it', () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  const dismiss = vi.fn(), activate = vi.fn()
  render(<HudWorkspace corporationId="dismiss" panels={panels} onPanelDismiss={dismiss} onPanelActivate={activate} />)
  fireEvent.click(screen.getByRole('button', { name: /^Command$/ }))
  expect(activate).toHaveBeenCalledExactlyOnceWith('command')
  const draft = screen.getByLabelText('Command draft')
  fireEvent.change(draft, { target: { value: 'Still here' } })
  fireEvent.click(screen.getByRole('button', { name: 'Close Command panel' }))
  expect(dismiss).toHaveBeenCalledExactlyOnceWith('command')
  fireEvent.click(screen.getByRole('button', { name: /^Command$/ }))
  expect(screen.getByLabelText('Command draft')).toBe(draft)
  expect(draft).toHaveValue('Still here')
})


it('keeps all three phone destinations and one sheet owner through Arrange handoffs', () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  const activate = vi.fn(), dismiss = vi.fn()
  render(<><button>Map background</button><HudWorkspace corporationId="navigation" panels={panels} onPanelActivate={activate} onPanelDismiss={dismiss} /></>)
  fireEvent.click(screen.getByRole('button', { name: 'Objects' }))
  const search = screen.getByLabelText('Object search')
  fireEvent.change(search, { target: { value: 'Keep search' } })
  const go = (name: string) => fireEvent.click(within(screen.getByRole('navigation', { name: 'HUD panels' })).getByRole('button', { name }))
  for (const name of ['Arrange HUD', 'Command', 'Arrange HUD', 'Objects']) {
    go(name)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const navigation = screen.getByRole('navigation', { name: 'HUD panels' })
    expect(within(navigation).getAllByRole('button')).toHaveLength(3)
    expect(within(navigation).getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Map background')).toHaveAttribute('inert')
  }
  expect(search).toHaveValue('Keep search')
  expect(activate.mock.calls.map(([id]) => id)).toEqual(['objects', 'command', 'objects'])
  fireEvent.click(screen.getByRole('button', { name: 'Close Objects panel' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByText('Map background')).not.toHaveAttribute('inert')
  expect(dismiss).toHaveBeenLastCalledWith('objects')
  expect(screen.getByRole('button', { name: 'Objects' })).toHaveFocus()
})


it('offers direct labeled phone icons with one visible navigation and restores its launch focus', () => {
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
  const activate = vi.fn()
  render(<><button>Map action</button><HudWorkspace corporationId="direct-icons" panels={panels} onPanelActivate={activate} /></>)
  const navigation = screen.getByRole('navigation', { name: 'HUD panels' })
  expect(screen.queryByRole('button', { name: 'HUD menu' })).toBeNull()
  expect(within(navigation).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(['Objects', 'Command', 'Arrange HUD'])
  for (const button of within(navigation).getAllByRole('button')) {
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button).not.toHaveAttribute('aria-expanded')
  }
  const trigger = within(navigation).getByRole('button', { name: 'Command' })
  trigger.focus(); fireEvent.click(trigger)
  expect(activate).toHaveBeenCalledWith('command')
  expect(screen.getAllByRole('navigation', { name: 'HUD panels' })).toHaveLength(1)
  expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Command' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(screen.getByLabelText('Command draft'), { target: { value: 'Preserve icon navigation draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Arrange HUD' }))
  fireEvent.click(screen.getByRole('button', { name: 'Command' }))
  expect(screen.getByLabelText('Command draft')).toHaveValue('Preserve icon navigation draft')
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close Command panel' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveFocus()
  expect(screen.getByText('Map action')).not.toHaveAttribute('inert')
})


it('uses one shared signal layer per owning panel and settings without lighting nested sections', async () => {
  const content = panels.map(panel => ({ ...panel, children: <HudCardShell title={`${panel.label} details`}>{panel.children}</HudCardShell> }))
  const { container } = render(<HudWorkspace corporationId="lighting" panels={content} />)
  await waitFor(() => expect(container.querySelectorAll('[data-panel] > [data-slot="hud-card"] > [data-slot="hud-frame-lighting"]')).toHaveLength(2))
  expect(container.querySelectorAll('[data-hud-framing="section"] [data-slot="hud-frame-lighting"]')).toHaveLength(0)
  settings()
  await waitFor(() => expect(screen.getByRole('region', { name: 'Arrange HUD' }).querySelector(':scope > [data-slot="hud-frame-lighting"]')).not.toBeNull())
})


it('migrates legacy Console entries without changing remaining hidden/dock preferences', () => {
  saved.set(key('legacy'), JSON.stringify([{ id: 'console', lane: 'bottom', visible: true }, { id: 'objects', lane: 'right', visible: false }, { id: 'command', lane: 'left', visible: false }]))
  render(<HudWorkspace corporationId="legacy" panels={panels} />)
  expect(JSON.parse(saved.get(key('legacy'))!)).toEqual([{ id: 'objects', lane: 'right', visible: false }, { id: 'command', lane: 'left', visible: false }])
  expect(screen.queryByRole('button', { name: /Console/ })).toBeNull()
  settings(); expect(screen.getByRole('button', { name: 'Reset HUD layout' })).toBeVisible()
})
