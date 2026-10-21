import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAccountOptional } from '@/components/account-provider'
import { GameViewWorkspace } from './GameViewShell'

vi.mock('@/components/account-provider', () => ({ useAccountOptional: vi.fn() }))
const signOut = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  vi.mocked(useAccountOptional).mockReturnValue({ user: { email: 'pilot@example.invalid' }, account: null, signOut } as unknown as ReturnType<typeof useAccountOptional>)
})
const panels = [{ id: 'fleets' as const, label: 'Fleets', children: <input aria-label="Command draft" defaultValue="" /> }]
it('makes account actions reachable through existing settings without signing out on open or reset', () => {
  render(<GameViewWorkspace corporationId="one" panels={panels} />)
  expect(screen.queryByTestId('sign-out-button')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Command draft'), { target: { value: 'Keep this' } })
  fireEvent.click(screen.getByRole('button', { name: 'Arrange HUD' }))
  const account = screen.getByRole('region', { name: 'Account settings' })
  expect(account).toHaveTextContent('pilot@example.invalid')
  fireEvent.click(screen.getByRole('button', { name: 'Reset HUD layout' }))
  expect(signOut).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Command draft')).toHaveValue('Keep this')
  fireEvent.click(within(account).getByRole('button', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalledTimes(1)
})
it('does not show account controls for guests or identity-free fixtures', () => {
  vi.mocked(useAccountOptional).mockReturnValue(undefined)
  render(<GameViewWorkspace corporationId="guest" panels={panels} />)
  fireEvent.click(screen.getByRole('button', { name: 'Arrange HUD' }))
  expect(screen.queryByTestId('sign-out-button')).not.toBeInTheDocument()
})
it('keeps account actions inside the single phone settings sheet without activating sign out', () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  render(<GameViewWorkspace corporationId="phone" panels={panels} />)
  fireEvent.click(screen.getByRole('button', { name: 'Arrange HUD' }))
  const sheet = screen.getByRole('dialog', { name: 'Arrange HUD' })
  expect(within(sheet).getByRole('button', { name: 'Sign out' })).toBeVisible()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close HUD settings' }))
  expect(screen.queryByTestId('sign-out-button')).not.toBeInTheDocument()
  expect(signOut).not.toHaveBeenCalled()
})
