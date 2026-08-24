import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import PolarBoardSpikePage from './page'

// The bench in jsdom: SVG renders fine, so the whole comparison is exercised.
// rAF is stubbed to a no-op so the clock never advances and the body positions
// stay deterministic across assertions.
beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(cleanup)

function turnFor(lattice: 'polar' | 'hex'): number {
  return Number(screen.getByTestId(`metric-turn-${lattice}`).textContent!.replace('°', ''))
}

describe('polar board bench page', () => {
  it('renders both lattices and the scoreboard', () => {
    render(<PolarBoardSpikePage />)
    expect(screen.getByTestId('board-stage')).toBeInTheDocument()
    expect(screen.getByTestId('polar-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('hex-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('polar-path')).toBeInTheDocument()
    expect(screen.getByTestId('hex-path')).toBeInTheDocument()
  })

  it('opens on the across-the-star case, where the arc turns far less than the cube solve', () => {
    // The headline the spike exists to produce, asserted rather than eyeballed.
    // Cube has to detour around the core and corners doing it; the arc sweeps
    // past without ever going near it.
    render(<PolarBoardSpikePage />)
    expect(turnFor('polar')).toBeLessThan(turnFor('hex'))
    expect(turnFor('polar')).toBeLessThan(2)
  })

  it('shows the cube solve detouring around the core while the arc never touches it', () => {
    render(<PolarBoardSpikePage />)
    // Neither path ends up ON the core, but only one of them had to work at it.
    expect(screen.getByTestId('metric-core-polar')).toHaveTextContent('0')
  })

  it('wins decisively on tangential work, the common case', () => {
    render(<PolarBoardSpikePage />)
    fireEvent.change(screen.getByTestId('ctl-preset'), { target: { value: 'Tangential burn' } })
    expect(turnFor('polar')).toBeLessThan(turnFor('hex'))
    expect(turnFor('polar')).toBeLessThan(2)
  })

  it('LOSES on the mixed inbound transfer — the finding that stops this being a clean win', () => {
    // Pinned deliberately. Descending ten rings while sweeping 162 degrees
    // aliases the radial and tangential axes against each other: the ring
    // drops land unevenly among the slot steps and each one jolts. Cube's
    // staircase is uniform by construction and smooths flatter. Anything that
    // claims polar is unconditionally smoother should fail this test.
    render(<PolarBoardSpikePage />)
    fireEvent.change(screen.getByTestId('ctl-preset'), { target: { value: 'Inbound transfer' } })
    expect(turnFor('polar')).toBeGreaterThan(turnFor('hex'))
  })

  it('stays clean on a near-pure radial descent, where the axes do not alias', () => {
    render(<PolarBoardSpikePage />)
    fireEvent.change(screen.getByTestId('ctl-preset'), { target: { value: 'Steep radial' } })
    expect(turnFor('polar')).toBeLessThan(turnFor('hex'))
  })

  it('scores cube at a flat 60 degrees of raw staircase whatever the order', () => {
    // The property that makes the cells row useless as a comparison and forces
    // the smoothed one: cube always alternates between two of six axial
    // directions, so its raw turn never moves.
    render(<PolarBoardSpikePage />)
    const raw = () => screen.getByTestId('metric-rawturn-hex').textContent
    const first = raw()
    for (const preset of ['Inbound transfer', 'Tangential burn', 'Steep radial']) {
      fireEvent.change(screen.getByTestId('ctl-preset'), { target: { value: preset } })
      expect(raw()).toBe(first)
    }
  })

  it('hides each lattice on demand', () => {
    render(<PolarBoardSpikePage />)
    fireEvent.change(screen.getByTestId('ctl-mode'), { target: { value: 'polar' } })
    expect(screen.queryByTestId('hex-path')).not.toBeInTheDocument()
    fireEvent.change(screen.getByTestId('ctl-mode'), { target: { value: 'hex' } })
    expect(screen.queryByTestId('polar-path')).not.toBeInTheDocument()
  })

  it('re-solves when the slot schedule changes', () => {
    render(<PolarBoardSpikePage />)
    const before = screen.getByTestId('metric-cells-polar').textContent
    fireEvent.change(screen.getByTestId('ctl-schedule'), { target: { value: 'Inner-dense' } })
    expect(screen.getByTestId('metric-cells-polar').textContent).not.toBe(before)
  })

  it('reseeds and re-sizes without throwing', () => {
    render(<PolarBoardSpikePage />)
    expect(() => fireEvent.click(screen.getByTestId('ctl-reseed'))).not.toThrow()
    expect(() => fireEvent.change(screen.getByTestId('ctl-radius'), { target: { value: '10' } })).not.toThrow()
  })
})
