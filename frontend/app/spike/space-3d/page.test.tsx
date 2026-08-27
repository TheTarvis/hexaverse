import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Space3dSpikePage from './page'

// The spike page in jsdom: the stage never measures (clientWidth 0), so the
// GL world never mounts — the HUD and the command flow render and are
// exercised without a GL context, same trick as the webgl-board bench.
describe('continuous-space spike page', () => {
  it('renders the stage, the readouts, and a ship parked in orbit with a full tank', () => {
    render(<Space3dSpikePage />)
    expect(screen.getByTestId('space-stage')).toBeInTheDocument()
    expect(screen.getByTestId('hud-status')).toHaveTextContent(/ORBIT · III/)
    expect(screen.getByTestId('hud-fuel')).toHaveTextContent('500 Δv')
    expect(screen.getByTestId('hud-target')).toHaveTextContent('—')
  })

  it('disables commit until a target is picked and cancel until a burn is running', () => {
    render(<Space3dSpikePage />)
    expect(screen.getByTestId('ctl-commit')).toBeDisabled()
    expect(screen.getByTestId('ctl-cancel')).toBeDisabled()
  })

  it('toggles between free rails orbit and fuel-burning station-keep', () => {
    render(<Space3dSpikePage />)
    const hold = screen.getByTestId('ctl-hold')
    expect(hold).toBeEnabled()
    expect(hold).toHaveTextContent('Hold here')
    fireEvent.click(hold)
    expect(screen.getByTestId('hud-status')).toHaveTextContent(/HOLD · III/)
    expect(hold).toHaveTextContent('Resume orbit')
    fireEvent.click(hold)
    expect(screen.getByTestId('hud-status')).toHaveTextContent(/ORBIT · III/)
  })

  it('drives the time controls', () => {
    render(<Space3dSpikePage />)
    expect(screen.getByTestId('ctl-speed')).toHaveValue('4')
    fireEvent.change(screen.getByTestId('ctl-speed'), { target: { value: '16' } })
    expect(screen.getByTestId('ctl-speed')).toHaveValue('16')
    const pause = screen.getByTestId('ctl-pause')
    expect(pause).toHaveTextContent('Pause')
    fireEvent.click(pause)
    expect(pause).toHaveTextContent('Resume')
  })

  it('reseeds into a fresh system without throwing', () => {
    render(<Space3dSpikePage />)
    const before = screen.getByText(/System KAPPA-/).textContent
    act(() => {
      fireEvent.click(screen.getByTestId('ctl-reseed'))
    })
    expect(screen.getByText(/System KAPPA-/).textContent).not.toBe(before)
  })
})
