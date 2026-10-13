import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Fleet } from '@/lib/types/fleet'
import { FleetLocationPanel } from './FleetLocationPanel'
const fleet = { id: 'fleet', systemId: 'origin', jump: { destSystemId: 'destination', departMs: 100, arriveMs: 200 }, roster: { ships: [{}] } } as Fleet
it('shows the real transit route and sends focus/navigation to its destination', () => {
  const focus = vi.fn(), open = vi.fn()
  render(<FleetLocationPanel fleet={fleet} names={{ origin: 'Sol', destination: 'Vega' }} worldTime={150} scale={1} onFocus={focus} onOpen={open} />)
  expect(screen.getByText('Sol → Vega')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
  fireEvent.click(screen.getByTestId('focus-selected-fleet')); fireEvent.click(screen.getByTestId('open-fleet-system'))
  expect(focus).toHaveBeenCalledWith('destination'); expect(open).toHaveBeenCalledWith('destination')
})
it('waits for served arrival, and disables navigation on failed telemetry', () => {
  const { rerender } = render(<FleetLocationPanel fleet={fleet} names={{}} worldTime={250} scale={1} onOpen={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Awaiting arrival confirmation')
  rerender(<FleetLocationPanel fleet={fleet} names={{}} worldTime={250} scale={1} onOpen={vi.fn()} failed />)
  expect(screen.getByRole('status')).toHaveTextContent('telemetry unavailable')
  expect(screen.queryByTestId('open-fleet-system')).not.toBeInTheDocument()
})
