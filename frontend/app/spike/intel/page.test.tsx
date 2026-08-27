import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import IntelSpikePage from './page'

// The intel spike page in jsdom: the stage never measures (clientWidth 0), so
// the GL world never mounts and the sim clock stays frozen at t=0 — the HUD
// and the scan/truth controls are exercised without a GL context.
describe('intel spike page', () => {
  it('renders the stage and opens with a flagged live contact (the patrol dwells at your planet)', () => {
    render(<IntelSpikePage />)
    expect(screen.getByTestId('intel-stage')).toBeInTheDocument()
    expect(screen.getByTestId('hud-contact')).toHaveTextContent('LIVE CONTACT')
    // Bubble entry mints a record immediately — the flag, not just a status.
    expect(screen.getByTestId('sighting-log')).toHaveTextContent(/CONTACT · seen 0:00:00/)
    expect(screen.getByTestId('hud-sighting')).toHaveTextContent(/GLIMPSE/)
    expect(screen.getByTestId('hud-scan')).toHaveTextContent('READY')
  })

  it('emits a pulse on scan: button disables and the echo shows inbound', () => {
    render(<IntelSpikePage />)
    const scan = screen.getByTestId('ctl-scan')
    expect(scan).toBeEnabled()
    fireEvent.click(scan)
    expect(scan).toBeDisabled()
    // The patrol is in-bubble at t=0, so the solved pulse has an echo in flight.
    expect(screen.getByTestId('hud-scan')).toHaveTextContent(/ECHO INBOUND/)
  })

  it('toggles the truth view', () => {
    render(<IntelSpikePage />)
    const truth = screen.getByTestId('ctl-truth')
    expect(truth).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(truth)
    expect(truth).toHaveAttribute('aria-pressed', 'true')
    expect(truth).toHaveTextContent('Truth: ON')
    fireEvent.click(truth)
    expect(truth).toHaveAttribute('aria-pressed', 'false')
  })

  it('drives the time controls', () => {
    render(<IntelSpikePage />)
    expect(screen.getByTestId('ctl-speed')).toHaveValue('4')
    fireEvent.change(screen.getByTestId('ctl-speed'), { target: { value: '16' } })
    expect(screen.getByTestId('ctl-speed')).toHaveValue('16')
    const pause = screen.getByTestId('ctl-pause')
    fireEvent.click(pause)
    expect(pause).toHaveTextContent('Resume')
  })

  it('reseeds into a fresh system and resets knowledge', () => {
    render(<IntelSpikePage />)
    fireEvent.click(screen.getByTestId('ctl-scan'))
    const before = screen.getByText(/System KAPPA-/).textContent
    act(() => {
      fireEvent.click(screen.getByTestId('ctl-reseed'))
    })
    expect(screen.getByText(/System KAPPA-/).textContent).not.toBe(before)
    expect(screen.getByTestId('hud-scan')).toHaveTextContent('READY')
    expect(screen.getByTestId('ctl-scan')).toBeEnabled()
  })
})
