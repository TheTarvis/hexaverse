import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { FleetStatusCard, type FleetStatusProps } from './FleetStatusCard'
import { fleetFixture, fixtureNameOf, fixtureResolveBody, statusFixture } from './fleet-status-study/fixtures'
import { formatTons } from '@/lib/format'

const props = (): FleetStatusProps & { onClose: () => void } => ({
  ...statusFixture('travelling'), scale: 1, nameOf: fixtureNameOf, resolveBody: fixtureResolveBody,
  travelControlsOpen: false, onTravelControls: vi.fn(), onBack: vi.fn(), onReviewTravel: vi.fn(), onFocus: vi.fn(), onRetry: vi.fn(), onStop: vi.fn(), onClose: vi.fn(),
})

it('shows served transit timing and delegates destination focus without issuing a command', () => {
  const input = { ...props(), ...statusFixture('transit'), worldTime: 150000, focusLabel: 'Focus destination' }
  render(<FleetStatusCard {...input} />)
  expect(screen.getByText('Command fleet · Nereid system → Aurelia system')).toBeVisible()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
  fireEvent.click(screen.getByRole('button', { name: 'Focus destination' }))
  expect(input.onFocus).toHaveBeenCalledOnce()
  expect(input.onStop).not.toHaveBeenCalled()
})

it('preserves independent disclosures through hiding and updates them from fresh roster data', () => {
  const input = props()
  const view = render(<div hidden={false}><FleetStatusCard {...input} /></div>)
  fireEvent.click(screen.getByRole('button', { name: /^Cargo · / }))
  fireEvent.click(screen.getByRole('button', { name: 'Ships · 3' }))
  expect(screen.getByText('Fuel (in hold)')).toBeVisible()
  view.rerender(<div hidden><FleetStatusCard {...input} /></div>)
  view.rerender(<div hidden={false}><FleetStatusCard {...input} fleet={fleetFixture({ roster: { ships: [{ class: 'seed' }], cargo: { fuel: 7, iron: 2 }, cargoCapacity: 80, freeHold: 71, miningRate: 1 } })} /></div>)
  expect(screen.getByRole('button', { name: /^Cargo · / })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'Ships · 1' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Fuel (in hold)').closest('dt')!.parentElement).toHaveTextContent(formatTons(7).replace(/\s/g, ' '))
  expect(screen.getByText('Combined hold')).toBeVisible()
})

it('hides stale facts and commands on failed reads, then restores disclosure state after recovery', () => {
  const input = props()
  const view = render(<FleetStatusCard {...input} />)
  fireEvent.click(screen.getByRole('button', { name: /^Cargo · / }))
  view.rerender(<FleetStatusCard {...input} failed />)
  expect(screen.queryByText('Fuel (in hold)')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Stop travel' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry readings' }))
  expect(input.onRetry).toHaveBeenCalledOnce()
  view.rerender(<FleetStatusCard {...input} />)
  expect(screen.getByRole('button', { name: /^Cargo · / })).toHaveAttribute('aria-expanded', 'true')
})

it('keeps Stop in the travel task footer, with busy state and Back owned by the same presentation', () => {
  const input = { ...props(), travelControlsOpen: true }
  const view = render(<FleetStatusCard {...input} />)
  expect(screen.queryByRole('button', { name: /^Cargo/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^Ships/ })).toBeNull()
  expect(screen.queryByText('Combined hold')).toBeNull()
  expect(screen.getByRole('button', { name: 'Stop travel' }).closest('[data-slot="hud-footer"]')).not.toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Stop travel' }))
  expect(input.onStop).toHaveBeenCalledOnce()
  view.rerender(<FleetStatusCard {...input} pending stopPending />)
  expect(screen.getByRole('button', { name: 'Stopping…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Back to fleet status' })).toBeDisabled()
  view.rerender(<FleetStatusCard {...input} travelControlsOpen={false} />)
  expect(screen.getByRole('button', { name: /^Cargo/ })).toBeVisible()
  expect(screen.getByRole('button', { name: /^Ships/ })).toBeVisible()
})


it('exposes eligible gate actions from summary without starting a new travel review', () => {
  const jump = vi.fn()
  const input = { ...props(), fleet: fleetFixture({ laneId: 'lane' }), additionalActions: [{ id: 'jump', label: 'Jump through gate', onClick: jump }] as const }
  const view = render(<FleetStatusCard {...input} />)
  fireEvent.click(screen.getByRole('button', { name: 'Travel controls' }))
  expect(input.onTravelControls).toHaveBeenCalledOnce()
  expect(input.onReviewTravel).not.toHaveBeenCalled()
  view.rerender(<FleetStatusCard {...input} travelControlsOpen />)
  const action = screen.getByRole('button', { name: 'Jump through gate' })
  expect(action.closest('[data-slot="hud-footer"]')).not.toBeNull()
  fireEvent.click(action)
  expect(jump).toHaveBeenCalledOnce()
  expect(input.onStop).not.toHaveBeenCalled()
})
