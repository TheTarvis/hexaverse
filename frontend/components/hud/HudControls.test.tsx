import { createRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { HudButton, HudIconButton } from './HudControls'
import { HudActionBand } from './HudActionBand'

afterEach(cleanup)

describe('shared HUD action interface', () => {
  it('does not submit implicitly; explicit submit still works', () => {
    const submit = vi.fn(event => event.preventDefault())
    render(<form onSubmit={submit}><HudButton>Choose fleet</HudButton><HudButton type="submit">Confirm name</HudButton></form>)
    fireEvent.click(screen.getByRole('button', { name: 'Choose fleet' }))
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm name' }))
    expect(submit).toHaveBeenCalledOnce()
  })

  it('retains destination, target and anchor ref', () => {
    const ref = createRef<HTMLAnchorElement>()
    render(<HudButton href="/systems/example" target="_blank" rel="noreferrer" ref={ref}>Open system</HudButton>)
    const link = screen.getByRole('link', { name: 'Open system' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/systems/example')
    expect(link).toHaveAttribute('target', '_blank')
    expect(ref.current).toBe(link)
  })

  it.each([false, true])('unavailable links remove destination and suppress callbacks (pending=%s)', pending => {
    const click = vi.fn(), capture = vi.fn(), auxiliary = vi.fn()
    render(<HudButton href="/systems/example" disabled={!pending} pending={pending} onClick={click} onClickCapture={capture} onAuxClick={auxiliary}>Open system</HudButton>)
    const link = screen.getByRole('link')
    expect(link).not.toHaveAttribute('href')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    if (pending) expect(link).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(link)
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(click).not.toHaveBeenCalled()
    expect(capture).not.toHaveBeenCalled()
    expect(auxiliary).not.toHaveBeenCalled()
  })

  it('treats explicitly undefined href as a native button', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<HudButton href={undefined} ref={ref}>Retry</HudButton>)
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Retry' }))
    expect(ref.current).toHaveAttribute('type', 'button')
  })

  it('preserves row ARIA, focus ref and callback', () => {
    const choose = vi.fn(), ref = createRef<HTMLButtonElement>()
    render(<HudButton presentation="row" aria-pressed="true" aria-expanded="true" ref={ref} onClick={choose}>Peregrine</HudButton>)
    const button = screen.getByRole('button', { name: 'Peregrine' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    ref.current?.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(choose).toHaveBeenCalledOnce()
  })

  it('supports menu roles and labeled icon links', () => {
    render(<><HudButton presentation="row" role="menuitem">Inspect fleet</HudButton><HudIconButton href="/" icon={ArrowLeftIcon} label="Return to galaxy" /></>)
    expect(screen.getByRole('menuitem', { name: 'Inspect fleet' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('link', { name: 'Return to galaxy' })).toHaveAttribute('href', '/')
  })

  it('prevents repeat commits while pending and restores the action', () => {
    const commit = vi.fn()
    const { rerender } = render(<HudButton pending onClick={commit}>Save</HudButton>)
    const working = screen.getByRole('button', { name: 'Working…' })
    expect(working).toBeDisabled()
    expect(working).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(working)
    expect(commit).not.toHaveBeenCalled()
    rerender(<HudButton onClick={commit}>Save</HudButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(commit).toHaveBeenCalledOnce()
  })

  it('pending footer locks siblings without marking them busy', () => {
    render(<HudActionBand actions={[{ id: 'cancel', label: 'Cancel', onClick: vi.fn() }, { id: 'delete', label: 'Delete preset', tone: 'danger', pending: true, onClick: vi.fn() }]} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Delete preset…' })).toHaveAttribute('aria-busy', 'true')
  })
})
