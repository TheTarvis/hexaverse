import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { CelestialActions } from './CelestialActions'

const mocks = vi.hoisted(() => ({ name: vi.fn(), survey: vi.fn(), options: vi.fn() }))
vi.mock('@/hooks/use-discovery', () => ({
  useSurveyOptions: mocks.options,
  useSurvey: () => ({ mutate: mocks.survey, isPending: false }),
  useCelestialName: () => ({ mutate: mocks.name, isPending: false, reset: vi.fn() }),
}))
const body = { id: 'feat-star', name: 'Generated Star', type: 'star', canName: true, space: { X: 0, Y: 0, Z: 0 }, size: 5 }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.options.mockReturnValue({ isSuccess: true, data: { range: 48, durationMs: 30000, worldTime: 0, survey: null, targets: [{ bodyId: body.id, eligible: true, reason: '' }] } })
})
it('previews a name and requires explicit confirmation while naming remotely', () => {
  render(<CelestialActions systemId="system-home" body={body} fleetId={null} onSettled={vi.fn()} />)
  fireEvent.click(screen.getByTestId('name-body'))
  fireEvent.change(screen.getByTestId('celestial-name'), { target: { value: '  Silver   Haven ' } })
  fireEvent.click(screen.getByTestId('preview-name'))
  expect(screen.getByTestId('name-preview')).toHaveTextContent('Silver Haven')
  expect(mocks.name).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('confirm-name'))
  expect(mocks.name).toHaveBeenCalledWith({ systemId: 'system-home', bodyId: body.id, name: 'Silver Haven' }, expect.any(Object))
})
it('surveys the inspected target using the existing command fleet', () => {
  render(<CelestialActions systemId="system-home" body={body} fleetId="command-fleet" onSettled={vi.fn()} />)
  fireEvent.click(screen.getByTestId('survey-body'))
  expect(mocks.survey).toHaveBeenCalledWith({ fleetId: 'command-fleet', bodyId: body.id })
})
it('shows progress and the permanent lock without offering station naming', () => {
  mocks.options.mockReturnValue({ isSuccess: true, data: { range: 48, durationMs: 30000, worldTime: 10000, survey: { bodyId: body.id, arriveMs: 30000 }, targets: [] } })
  const { rerender } = render(<CelestialActions systemId="system-home" body={{ ...body, canName: false, discovery: { firstPlayerName: { corporationId: 'owner', at: 1 } } }} fleetId="command-fleet" onSettled={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('20 world seconds remaining')
  expect(screen.getByText('This name is locked.')).toBeInTheDocument()
  expect(screen.queryByTestId('name-body')).not.toBeInTheDocument()
  rerender(<CelestialActions systemId="system-home" body={{ ...body, type: 'station', name: 'Home Station', canName: false }} fleetId="command-fleet" onSettled={vi.fn()} />)
  expect(screen.queryByTestId('survey-body')).not.toBeInTheDocument()
  expect(screen.queryByTestId('name-body')).not.toBeInTheDocument()
})
