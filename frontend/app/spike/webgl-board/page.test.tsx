import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WebGLBoardSpikePage from './page'

// The bench page in jsdom: the container never measures (no layout), so the
// projection stays not-ready and the dynamically-imported GL world never
// mounts — which is exactly what lets the packing/wiring around it render
// and be exercised without a GL context.
describe('WebGL board bench page', () => {
  it('renders the stage and the tuning controls at the production defaults', () => {
    render(<WebGLBoardSpikePage />)
    expect(screen.getByTestId('board-stage')).toBeInTheDocument()
    expect(screen.getByTestId('ctl-bloom')).toHaveValue('0.25')
    expect(screen.getByTestId('ctl-instrument')).toHaveValue('0.15')
    expect(screen.getByTestId('ctl-tilt')).toHaveValue('14')
  })

  it('re-packs the fixture when the system character changes', () => {
    render(<WebGLBoardSpikePage />)
    const before = screen.getByText(/bodies/i).parentElement!.textContent
    fireEvent.change(screen.getByTestId('ctl-character'), { target: { value: 'dead' } })
    // A dead system packs a different body census than a normal one.
    expect(screen.getByText(/bodies/i).parentElement!.textContent).not.toBe(before)
  })

  it('reseeds on demand', () => {
    render(<WebGLBoardSpikePage />)
    expect(() => fireEvent.click(screen.getByTestId('ctl-reseed'))).not.toThrow()
  })
})
