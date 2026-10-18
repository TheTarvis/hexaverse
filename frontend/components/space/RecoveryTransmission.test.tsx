import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RecoveryTransmission } from './RecoveryTransmission'
import { newGuide } from '@/lib/command-onboarding'
import type { Fleet } from '@/lib/types/fleet'

const props = { guide: newGuide('corp', 'fleet', 'home'), fleet: { id: 'fleet' } as Fleet, bodies: [], interiorFailed: false, actionFailed: false, onRetryAction: vi.fn(), onSave: vi.fn(), onTarget: vi.fn(), onScan: vi.fn() }

describe('recovery transmission', () => {
  it('starts with a wake transmission without a find-fleet task', () => {
    render(<RecoveryTransmission {...props} />)
    expect(screen.getByTestId('recovery-copy')).toHaveTextContent('Wakey wakey. You’re online.')
    fireEvent.click(screen.getByTestId('begin-guide'))
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: 'objects', targetId: null }))
  })
  it('offers scan when resources are unknown without inventing a planet', () => {
    render(<RecoveryTransmission {...props} guide={{ ...props.guide, phase: 'target' }} />)
    fireEvent.click(screen.getByTestId('guide-scan'))
    expect(props.onScan).toHaveBeenCalled()
    expect(screen.queryByTestId('guide-target')).not.toBeInTheDocument()
  })
  it('distinguishes a failed read from an undiscovered resource site and allows dismissal', () => {
    render(<RecoveryTransmission {...props} interiorFailed guide={{ ...props.guide, phase: 'target' }} />)
    expect(screen.getByTestId('recovery-copy')).toHaveTextContent('telemetry is unavailable')
    expect(screen.queryByTestId('guide-scan')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('dismiss-guide'))
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: 'dismissed' }))
  })
})


it('targets a real station for the return and explains unavailable station telemetry', () => {
  const guide = { ...props.guide, phase: 'return' as const, resource: 'water' as const }
  const station = { systemId: 'home', featureId: 'station', createdAt: 1 }
  const body = { id: 'station', type: 'station', size: 1, space: { X: 1, Y: 0, Z: 1 } }
  const { rerender } = render(<RecoveryTransmission {...props} guide={guide} station={station} bodies={[body]} />)
  expect(screen.getByTestId('live-mining-check')).toHaveTextContent('Confirmed')
  expect(screen.getByTestId('live-fuel-check')).toHaveTextContent('Pending')
  fireEvent.click(screen.getByTestId('guide-station'))
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ stationId: 'station', phase: 'return' }))
  expect(props.onTarget).toHaveBeenCalledWith('station')
  rerender(<RecoveryTransmission {...props} guide={guide} stationFailed />)
  expect(screen.queryByTestId('guide-station')).not.toBeInTheDocument()
  expect(screen.getByTestId('recovery-copy')).toHaveTextContent('Station telemetry is unavailable')
  rerender(<RecoveryTransmission {...props} guide={guide} />)
  expect(screen.getByTestId('recovery-copy')).toHaveTextContent('No trading station is disclosed')
})

it('introduces Objects, station services and scanning before travel', () => {
  const onObjects = vi.fn()
  const station = { systemId: 'home', featureId: 'station', createdAt: 1 }
  const body = { id: 'station', type: 'station', size: 1, space: { X: 1, Y: 0, Z: 1 } }
  const { rerender } = render(<RecoveryTransmission {...props} guide={{ ...props.guide, phase: 'objects' }} onObjects={onObjects} />)
  fireEvent.click(screen.getByTestId('guide-objects'))
  expect(onObjects).toHaveBeenCalledOnce()
  rerender(<RecoveryTransmission {...props} guide={{ ...props.guide, phase: 'station' }} station={station} bodies={[body]} />)
  expect(screen.getByTestId('recovery-copy')).toHaveTextContent('Sell mined cargo here, then buy fuel')
  fireEvent.click(screen.getByTestId('guide-introduce-scan'))
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: 'scan', stationId: 'station' }))
  rerender(<RecoveryTransmission {...props} guide={{ ...props.guide, phase: 'scan' }} />)
  fireEvent.click(screen.getByTestId('guide-open-scan'))
  expect(props.onScan).toHaveBeenCalled()
})

// Actual isolation ownership must exist only while the tutorial is mounted.
it('uses the shared illuminated card and releases modal isolation and focus on unmount', async () => {
  const origin = document.createElement('button')
  origin.textContent = 'Map origin'
  document.body.append(origin)
  origin.focus()
  const view = render(<RecoveryTransmission {...props} />)
  const dialog = screen.getByRole('dialog', { name: 'Recovery transmission' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(origin).toHaveAttribute('inert')
  expect(dialog.contains(document.activeElement)).toBe(true)
  await waitFor(() => expect(dialog.querySelector('[data-slot="hud-frame-lighting"]')).not.toBeNull())
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({ phase: 'dismissed' }))
  view.unmount()
  expect(origin).not.toHaveAttribute('inert')
  expect(document.activeElement).toBe(origin)
  origin.remove()
})
