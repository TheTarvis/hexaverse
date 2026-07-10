import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SystemBoardView } from './SystemBoardView'
import { useSystemBoard } from '@/hooks/use-system-board'
import type { SystemBoard } from '@/lib/types/system-board'
import type { UseQueryResult } from '@tanstack/react-query'

vi.mock('@/hooks/use-system-board', () => ({
  useSystemBoard: vi.fn(),
}))

const mockHook = vi.mocked(useSystemBoard)

// HexBoard is NOT mocked here: the success test renders the real SVG lattice so
// this suite verifies the full composed tree (data hook → HexBoard → HexLattice
// + the facts overlay) actually mounts — the closest in-harness stand-in for the
// browser eyeball this route enables.

function boardFixture(): SystemBoard {
  return {
    systemId: 'sys-7',
    // Small radius keeps the rendered lattice light in jsdom while still
    // exercising the real hexesWithinRadius / fitViewBox / tile-tinting path.
    radius: 3,
    character: 'star_rich',
    starClass: 'G',
    worldTime: 0,
    features: [
      { id: 'f-star', type: 'star', fixed: true, footprint: [{ q: 0, r: 0 }], band: 'visible', live: true },
      { id: 'f-1', type: 'rocky', footprint: [{ q: 3, r: 0 }], band: 'astronomical', live: false },
    ],
  }
}

function mockState(state: Partial<UseQueryResult<SystemBoard, Error>>) {
  mockHook.mockReturnValue(state as UseQueryResult<SystemBoard, Error>)
}

describe('SystemBoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a charting placeholder while loading', () => {
    mockState({ isLoading: true, isError: false, data: undefined })
    render(<SystemBoardView systemId="sys-7" />)

    expect(screen.getByTestId('system-board-view')).toBeInTheDocument()
    expect(screen.queryByTestId('hex-board')).not.toBeInTheDocument()
    expect(screen.getByText(/charting the system/i)).toBeInTheDocument()
  })

  it('shows an error panel when the read fails', () => {
    mockState({ isLoading: false, isError: true, data: undefined, error: new Error('boom') })
    render(<SystemBoardView systemId="sys-7" />)

    expect(screen.getByText(/couldn’t load the system/i)).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    expect(screen.queryByTestId('hex-board')).not.toBeInTheDocument()
  })

  it('mounts the real hex lattice with a facts chip on success', () => {
    mockState({ isLoading: false, isError: false, data: boardFixture() })
    render(<SystemBoardView systemId="sys-7" />)

    // The real SVG board + its star-centre tile render (not a stub).
    expect(screen.getByTestId('hex-board')).toBeInTheDocument()
    expect(screen.getByTestId('hex-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('hex-tile-0,0')).toBeInTheDocument()

    const facts = screen.getByTestId('system-facts')
    expect(facts).toHaveTextContent('Class G system')
    expect(facts).toHaveTextContent('star rich')
    // Radius (3) and body count (2) surface as facts.
    expect(facts).toHaveTextContent('3')
    expect(facts).toHaveTextContent('2')
  })
})
