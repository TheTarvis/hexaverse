import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import StealthSpikePage from './page'

// The stealth spike page in jsdom: the SVG never measures, so the rAF loop
// never starts and the sim clock stays frozen at t=0 — the HUD, sliders, and
// controls are exercised on a single static frame.
describe('stealth spike page', () => {
  it('renders the stage, a dark contact, and the empty event log', () => {
    render(<StealthSpikePage />)
    expect(screen.getByTestId('stealth-stage')).toBeInTheDocument()
    expect(screen.getByTestId('stealth-svg')).toBeInTheDocument()
    expect(screen.getByTestId('observer-handle')).toBeInTheDocument()
    // The patrol opens parked (near-dark) with the observer out at the rim.
    expect(screen.getByTestId('hud-contact')).toHaveTextContent('DARK')
    expect(screen.getByTestId('hud-signature')).toHaveTextContent(/ORBIT/)
    expect(screen.getByTestId('event-log')).toHaveTextContent('no events yet')
    expect(screen.getByTestId('hud-marker')).toHaveTextContent('click the map')
  })

  it('shows the eclipsed fraction for the patrol home orbit', () => {
    render(<StealthSpikePage />)
    expect(screen.getByTestId('hud-eclipse')).toHaveTextContent(/hidden \d+%/)
  })

  it('drives the three tuning dials', () => {
    render(<StealthSpikePage />)
    expect(screen.getByTestId('dial-plume-value')).toHaveTextContent('120 u')
    fireEvent.change(screen.getByTestId('dial-plume'), { target: { value: '200' } })
    expect(screen.getByTestId('dial-plume-value')).toHaveTextContent('200 u')
    fireEvent.change(screen.getByTestId('dial-trim'), { target: { value: '25' } })
    expect(screen.getByTestId('dial-trim-value')).toHaveTextContent('25 u')
    fireEvent.change(screen.getByTestId('dial-bubble'), { target: { value: '60' } })
    expect(screen.getByTestId('dial-bubble-value')).toHaveTextContent('60 u')
  })

  it('drives the time controls', () => {
    render(<StealthSpikePage />)
    expect(screen.getByTestId('ctl-speed')).toHaveValue('4')
    fireEvent.change(screen.getByTestId('ctl-speed'), { target: { value: '16' } })
    expect(screen.getByTestId('ctl-speed')).toHaveValue('16')
    const pause = screen.getByTestId('ctl-pause')
    fireEvent.click(pause)
    expect(pause).toHaveTextContent('Resume')
  })

  it('reseeds into a fresh system and clears the log and marker', () => {
    render(<StealthSpikePage />)
    const before = screen.getByText(/System KAPPA-/).textContent
    act(() => {
      fireEvent.click(screen.getByTestId('ctl-reseed'))
    })
    expect(screen.getByText(/System KAPPA-/).textContent).not.toBe(before)
    expect(screen.getByTestId('event-log')).toHaveTextContent('no events yet')
    expect(screen.getByTestId('hud-marker')).toHaveTextContent('click the map')
  })
})
