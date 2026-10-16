import { useEffect, useLayoutEffect, useRef } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { HudWorkspace, type HudWorkspacePanel } from './HudWorkspace'

const key = (corporation: string) => `hexaverse:hud-layout:v1:${corporation}`
let saved: Map<string, string>
const panels: HudWorkspacePanel[] = [
  { id: 'objects', label: 'Objects', children: <input aria-label="Object search" defaultValue="" /> },
  { id: 'command', label: 'Command', children: <button>Review course</button> },
  { id: 'console', label: 'Console', children: <input aria-label="Console draft" defaultValue="" /> },
]
beforeEach(() => {
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
  expect(screen.getByRole('button', { name: 'Console' })).toBeInTheDocument()
})

it('restores defaults and removes only the current corporation layout key', () => {
  saved.set(key('other'), 'keep-me')
  saved.set('session', 'keep-session')
  render(<HudWorkspace corporationId="one" panels={panels} />)
  settings()
  for (const label of ['Objects', 'Command', 'Console']) fireEvent.click(screen.getByRole('button', { name: `Show ${label}` }))
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
  const draft = screen.getByLabelText('Console draft')
  fireEvent.change(draft, { target: { value: 'Hold position' } })
  fireEvent.click(screen.getByRole('button', { name: 'Hide Console' }))
  view.rerender(<HudWorkspace corporationId="one" panels={panels} request={{ id: 'console', sequence: 1 }} />)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Console panel' })).toHaveFocus())
  expect(screen.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true')
  expect(draft).toHaveValue('Hold position'); expect(draft).toBeVisible()
  screen.getByRole('button', { name: 'Arrange HUD' }).focus()
  view.rerender(<HudWorkspace corporationId="one" panels={panels} request={{ id: 'console', sequence: 2 }} />)
  await waitFor(() => expect(screen.getByRole('region', { name: 'Console panel' })).toHaveFocus())
  expect(within(screen.getByRole('region', { name: 'Console panel' })).getByLabelText('Console draft')).toBe(draft)
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
  function ConsoleChild({ sequence }: { sequence: number }) {
    const tab = useRef<HTMLButtonElement>(null)
    useEffect(() => { if (sequence) tab.current?.focus() }, [sequence])
    return <button ref={tab}>Orders tab</button>
  }
  function Host({ sequence }: { sequence: number }) {
    return <HudWorkspace corporationId="one" panels={panels.map(panel => panel.id === 'console' ? { ...panel, children: <ConsoleChild sequence={sequence} /> } : panel)} {...(sequence ? { request: { id: 'console' as const, sequence } } : {})} />
  }
  const view = render(<Host sequence={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide Console' }))
  view.rerender(<Host sequence={1} />)
  expect(screen.getByRole('button', { name: 'Orders tab' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true')
})

it('does not steal focus moved elsewhere between a request and passive effect flush', () => {
  function Host({ sequence }: { sequence: number }) {
    const outside = useRef<HTMLButtonElement>(null)
    // Parent layout effects run after the workspace captures the request origin,
    // before passive reveal/focus work: the user has moved to another control.
    useLayoutEffect(() => { if (sequence) outside.current?.focus() }, [sequence])
    return <><button ref={outside}>Navigation</button><HudWorkspace corporationId="one" panels={panels} {...(sequence ? { request: { id: 'console' as const, sequence } } : {})} /></>
  }
  const view = render(<Host sequence={0} />)
  fireEvent.click(screen.getByRole('button', { name: 'Hide Console' }))
  view.rerender(<Host sequence={1} />)
  expect(screen.getByRole('button', { name: 'Navigation' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Console' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByLabelText('Console draft')).toBeVisible()
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
