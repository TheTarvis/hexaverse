import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactsPanel, type BoardSelection } from './FactsPanel'
import { planToHex } from './move-preview'
import type { Fleet } from '@/lib/types/fleet'
import type { BoardFeature } from '@/lib/types/system-board'

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 's',
  state: { mode: 'coast' },
  position: { q: 3, r: 0 },
  own: true,
  worldTime: 0,
}

const base = {
  starClass: 'G',
  character: 'star_rich',
  radius: 16,
  featureCount: 4,
  worldTime: 1_000_000,
  pending: false,
  onMove: vi.fn(),
  onScan: vi.fn(),
  onCancel: vi.fn(),
}

function feature(over: Partial<BoardFeature>): BoardFeature {
  return { id: 'f', type: 'rocky', footprint: [{ q: 2, r: 0 }], band: 'visible', live: true, ...over }
}

describe('FactsPanel', () => {
  it('offers scan on the active fleet and reports its mode', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={ownFleet} plan={null} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('coast')
    expect(screen.getByTestId('scan-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('scan-button'))
    expect(base.onScan).toHaveBeenCalled()
  })

  it('shows a move commit + ETA for a selected body', () => {
    const selection: BoardSelection = { kind: 'feature', feature: feature({ id: 'p1' }) }
    const plan = planToHex({ q: 3, r: 0 }, { q: 2, r: 0 }, 0)
    render(<FactsPanel {...base} selection={selection} activeFleet={ownFleet} plan={plan} />)
    expect(screen.getByTestId('move-button')).toHaveTextContent('Intercept')
    expect(screen.getByTestId('move-eta')).toHaveTextContent('ETA')
  })

  it('ghosts a remembered body with its last-seen age; hides worth on astronomical', () => {
    const remembered: BoardSelection = {
      kind: 'feature',
      feature: feature({ band: 'remembered', asOf: 1_000_000 - 120_000 }),
    }
    const { rerender } = render(
      <FactsPanel {...base} selection={remembered} activeFleet={null} plan={null} />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent(/last seen/i)

    const astro: BoardSelection = { kind: 'feature', feature: feature({ band: 'astronomical' }) }
    rerender(<FactsPanel {...base} selection={astro} activeFleet={null} plan={null} />)
    expect(screen.getByTestId('selection')).toHaveTextContent(/scan to reveal/i)
  })

  it('offers cancel only while the active fleet is burning', () => {
    const burning: Fleet = {
      ...ownFleet,
      state: {
        mode: 'burn',
        burn: { path: [{ q: 0, r: 0 }], startTime: 0, arriveTime: 10, target: { hex: { q: 0, r: 0 } } },
      },
    }
    render(<FactsPanel {...base} selection={null} activeFleet={burning} plan={null} />)
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
    // Scan is blocked while burning (single action slot).
    expect(screen.getByTestId('scan-button')).toBeDisabled()
  })
})
