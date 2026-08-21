import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactsPanel, type BoardSelection } from './FactsPanel'
import { planToHex } from './move-preview'
import type { Fleet, RoutePreview } from '@/lib/types/fleet'
import type { BoardFeature, LaneGate } from '@/lib/types/system-board'

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
  route: null,
  onMove: vi.fn(),
  onScan: vi.fn(),
  onMine: vi.fn(),
  onCancelMine: vi.fn(),
  onCancel: vi.fn(),
  onDepart: vi.fn(),
}

function feature(over: Partial<BoardFeature>): BoardFeature {
  return { id: 'f', type: 'rocky', footprint: [{ q: 2, r: 0 }], band: 'visible', live: true, ...over }
}

describe('FactsPanel', () => {
  it('offers the 360° sweep on the active fleet, no aim required', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={ownFleet} plan={null} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('coast')
    expect(screen.getByTestId('active-fleet')).toHaveTextContent(/sweeps 360/i)
    expect(screen.getByTestId('scan-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('scan-button'))
    expect(base.onScan).toHaveBeenCalled()
  })

  it('toggles the scan FX between radial ping and arc-scan', () => {
    const onToggleScanFx = vi.fn()
    const { rerender } = render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        scanFx="ping"
        onToggleScanFx={onToggleScanFx}
      />,
    )
    const toggle = screen.getByTestId('scan-fx-toggle')
    expect(toggle).toHaveTextContent(/radial ping/i)
    fireEvent.click(toggle)
    expect(onToggleScanFx).toHaveBeenCalled()

    rerender(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        scanFx="arc"
        onToggleScanFx={onToggleScanFx}
      />,
    )
    expect(screen.getByTestId('scan-fx-toggle')).toHaveTextContent(/arc-scan/i)
  })

  it('counts down a running scan and blocks a second one', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        worldTime={5_000}
        scanEta={30_000}
      />,
    )
    expect(screen.getByTestId('scan-button')).toBeDisabled()
    expect(screen.getByTestId('scan-button')).toHaveTextContent(/scanning/i)
    expect(screen.getByTestId('scan-countdown')).toHaveTextContent(/25s/)
  })

  it('shows a move commit + ETA for a selected body', () => {
    const selection: BoardSelection = { kind: 'feature', feature: feature({ id: 'p1' }) }
    const plan = planToHex({ q: 3, r: 0 }, { q: 2, r: 0 }, 0)
    render(<FactsPanel {...base} selection={selection} activeFleet={ownFleet} plan={plan} />)
    expect(screen.getByTestId('move-button')).toHaveTextContent('Intercept')
    expect(screen.getByTestId('move-eta')).toHaveTextContent('ETA')
  })

  it('blocks moving onto the star (no plan → no move button, shows a note)', () => {
    const star: BoardSelection = { kind: 'feature', feature: feature({ id: 'star', type: 'star', fixed: true }) }
    render(<FactsPanel {...base} selection={star} activeFleet={ownFleet} plan={null} />)
    expect(screen.queryByTestId('move-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('core-blocked')).toBeInTheDocument()
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

  const gate: LaneGate = { destSystemId: 'sys-neighbour', hex: { q: 16, r: 0 } }
  const gateSelection: BoardSelection = { kind: 'gate', gate }

  it('previews the route and departs through a selected gate', () => {
    const route: RoutePreview = {
      route: ['sys-here', 'sys-neighbour'],
      legEtas: [1_030_000, 1_120_000], // gate ETA, then arrival
      totalEta: 1_120_000,
      departGate: { q: 16, r: 0 },
      worldTime: 1_000_000,
    }
    render(
      <FactsPanel
        {...base}
        selection={gateSelection}
        activeFleet={ownFleet}
        plan={null}
        route={{ isLoading: false, isError: false, data: route }}
      />,
    )
    expect(screen.getByTestId('gate-facts')).toBeInTheDocument()
    const depart = screen.getByTestId('depart-button')
    expect(depart).toHaveTextContent('Depart')
    fireEvent.click(depart)
    expect(base.onDepart).toHaveBeenCalled()
  })

  it('reports no charted route through a gate', () => {
    render(
      <FactsPanel
        {...base}
        selection={gateSelection}
        activeFleet={ownFleet}
        plan={null}
        route={{ isLoading: false, isError: true }}
      />,
    )
    expect(screen.getByTestId('gate-no-route')).toBeInTheDocument()
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  it('asks for a fleet before departing when none is here', () => {
    render(
      <FactsPanel {...base} selection={gateSelection} activeFleet={null} plan={null} route={null} />,
    )
    expect(screen.getByTestId('gate-facts')).toHaveTextContent(/bring a fleet here/i)
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  // --- mine (#0010, add-mine-ui) --------------------------------------------

  const lodeFeature = feature({
    id: 'p1',
    resources: [
      { kind: 'metals', richness: 0.5 },
      { kind: 'water', richness: 0.8 },
    ],
  })
  // Docked to the lode, with the owner-only roster block: 12t of metals
  // aboard, 188t free of 200, one seed hull's rate. The mine offer anchors to
  // this docked state — no board selection involved.
  const dockedMiner: Fleet = {
    ...ownFleet,
    state: { mode: 'docked', docked: { parentId: 'p1' } },
    roster: {
      ships: [{ class: 'seed' }],
      cargo: { metals: 12 },
      cargoCapacity: 200,
      freeHold: 188,
      miningRate: 0.001,
    },
  }

  it('offers mine while docked at a lode — no selection — defaulting to richest kind + full hold', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} dockedFeature={lodeFeature} plan={null} />,
    )
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
    // Kind chips carry the visible richness; the richest is preselected.
    expect(screen.getByTestId('mine-kind-water')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mine-kind-water')).toHaveTextContent('80%')
    expect(screen.getByTestId('mine-kind-metals')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(188)
    fireEvent.click(screen.getByTestId('mine-button'))
    expect(base.onMine).toHaveBeenCalledWith('water', 188)
  })

  it('switches the kind by chip — the commit follows the selection', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} dockedFeature={lodeFeature} plan={null} />,
    )
    fireEvent.click(screen.getByTestId('mine-kind-metals'))
    expect(screen.getByTestId('mine-kind-metals')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mine-kind-water')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByTestId('mine-button'))
    expect(base.onMine).toHaveBeenCalledWith('metals', 188)
  })

  it('refills the tonnage to the free hold via Fill hold', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} dockedFeature={lodeFeature} plan={null} />,
    )
    fireEvent.change(screen.getByTestId('mine-tons-input'), { target: { value: '60' } })
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(60)
    fireEvent.click(screen.getByTestId('mine-fill-hold'))
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(188)
  })

  it('does not offer mine when merely co-located (coasting, not docked)', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={ownFleet} dockedFeature={lodeFeature} plan={null} />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
  })

  it('does not offer mine when the docked body has no visible resources', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        dockedFeature={feature({ id: 'p1' })}
        plan={null}
      />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
  })

  it('clamps the tonnage input to the free hold', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} dockedFeature={lodeFeature} plan={null} />,
    )
    const input = screen.getByTestId('mine-tons-input')
    fireEvent.change(input, { target: { value: '9999' } })
    expect(input).toHaveValue(188)
    fireEvent.change(input, { target: { value: '-5' } })
    expect(input).toHaveValue(0)
    // A zero-ton run is uncommittable — the server would reject it anyway.
    expect(screen.getByTestId('mine-button')).toBeDisabled()
  })

  it('previews the eta as tons ÷ the served mining rate, tracking the input', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} dockedFeature={lodeFeature} plan={null} />,
    )
    // 188t ÷ 0.001 t/ms = 188_000 ms → "3m".
    expect(screen.getByTestId('mine-eta')).toHaveTextContent('ETA 3m')
    // The served rate reads in human units: 0.001 t/ms = 60 t/min.
    expect(screen.getByTestId('mine-rate')).toHaveTextContent('at 60 t/min')
    fireEvent.change(screen.getByTestId('mine-tons-input'), { target: { value: '60' } })
    // 60t ÷ 0.001 = 60_000 ms → "1m".
    expect(screen.getByTestId('mine-eta')).toHaveTextContent('ETA 1m')
  })

  it('shows the running mine as a countdown with cancel, gating move but never scan', () => {
    render(
      <FactsPanel
        {...base}
        selection={{ kind: 'hex', hex: { q: 2, r: 0 } }}
        activeFleet={dockedMiner}
        dockedFeature={lodeFeature}
        plan={planToHex({ q: 3, r: 0 }, { q: 2, r: 0 }, 0)}
        worldTime={5_000}
        mineEta={30_000}
      />,
    )
    // The channel is busy: no fresh offer, a countdown + cancel instead.
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('mine-countdown')).toHaveTextContent(/25s/)
    expect(screen.getByTestId('move-button')).toBeDisabled()
    expect(screen.getByTestId('scan-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('cancel-mine-button'))
    expect(base.onCancelMine).toHaveBeenCalled()
  })

  it('lifts the mine gating once the eta passes, by world time alone', () => {
    render(
      <FactsPanel
        {...base}
        selection={{ kind: 'hex', hex: { q: 2, r: 0 } }}
        activeFleet={dockedMiner}
        dockedFeature={lodeFeature}
        plan={planToHex({ q: 3, r: 0 }, { q: 2, r: 0 }, 0)}
        worldTime={31_000}
        mineEta={30_000}
      />,
    )
    // Past-eta: the stale running entry stops gating — offer + move return.
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
    expect(screen.queryByTestId('mine-countdown')).not.toBeInTheDocument()
    expect(screen.getByTestId('move-button')).toBeEnabled()
  })

  it('reads the hold: used/total capacity, tons by kind, and the free remainder', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={dockedMiner} plan={null} />)
    expect(screen.getByTestId('hold-readout')).toBeInTheDocument()
    expect(screen.getByTestId('hold-capacity')).toHaveTextContent('12 / 200t')
    expect(screen.getByTestId('hold-metals')).toHaveTextContent('12t')
    expect(screen.getByTestId('hold-free')).toHaveTextContent('188t')
  })

  it('offers cancel only while the active fleet is burning', () => {
    // The burn's ETA sits ahead of the panel's worldTime — a past-ETA burn IS
    // already settled (stateAt) and correctly offers no cancel.
    const burning: Fleet = {
      ...ownFleet,
      state: {
        mode: 'burn',
        burn: {
          path: [{ q: 0, r: 0 }],
          startTime: 0,
          arriveTime: 2_000_000,
          target: { hex: { q: 0, r: 0 } },
        },
      },
    }
    render(<FactsPanel {...base} selection={null} activeFleet={burning} plan={null} />)
    expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
    // Scanning stays available mid-burn — movement and sensing are separate
    // channels (#0006 Decision #19).
    expect(screen.getByTestId('scan-button')).toBeEnabled()
  })

  // --- renderer availability (add-renderer-availability-states, tasks.md 2.2) ---
  //
  // The `available` prop the guard eventually wires from `BoardCanvas`'s
  // status (port-board-to-webgl-renderer's job) — testable today directly
  // against FactsPanel, no canvas involved.

  it('defaults `available` to true — every existing caller keeps the unchanged empty-selection copy (SDET-added regression: task 2.2b\'s explicit "no existing caller changes behaviour")', () => {
    // Deliberately omits `available` entirely.
    render(<FactsPanel {...base} selection={null} activeFleet={null} plan={null} />)
    expect(screen.getByTestId('selection')).toHaveTextContent(/select a body, tile, or gate/i)
  })

  it('available=true (explicit) also shows the ordinary select-on-the-canvas prompt', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} plan={null} available />)
    expect(screen.getByTestId('selection')).toHaveTextContent(/select a body, tile, or gate/i)
  })

  it('available=false: the empty-selection prompt does NOT invite selecting on a canvas that does not exist, and says the board must be available instead (Scenario: Move and departure verbs are unreachable without the canvas)', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} plan={null} available={false} />)
    const selection = screen.getByTestId('selection')
    expect(selection).not.toHaveTextContent(/select a body, tile, or gate/i)
    expect(selection).toHaveTextContent(/board/i)
    expect(selection).toHaveTextContent(/available/i)
  })

  it('available=false with a fleet present: scan, mine, cancel-burn, and cancel-mine remain invokable through FactsPanel WITHOUT a board selection (Scenario: Surrounding board affordances remain usable — SDET-added regression per task 2.2a: "pin it so a future refactor can\'t silently couple them to selection")', () => {
    const burningDockedMiner = {
      ...dockedMiner,
      state: {
        mode: 'burn' as const,
        burn: {
          path: [{ q: 0, r: 0 }],
          startTime: 0,
          arriveTime: 2_000_000,
          target: { hex: { q: 0, r: 0 } },
        },
      },
    }
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={burningDockedMiner}
        dockedFeature={null}
        plan={null}
        available={false}
        worldTime={5_000}
        mineEta={30_000}
      />,
    )
    // scan: always reads activeFleet, never selection.
    expect(screen.getByTestId('scan-button')).toBeEnabled()
    // cancel-burn: reads activeMode==='burn', never selection.
    expect(screen.getByTestId('cancel-button')).toBeEnabled()
    // cancel-mine: reads mineEta, never selection.
    fireEvent.click(screen.getByTestId('cancel-mine-button'))
    expect(base.onCancelMine).toHaveBeenCalled()
  })

  it('available=false does not affect the mine offer (still anchored to the docked state, never a selection)', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        dockedFeature={lodeFeature}
        plan={null}
        available={false}
      />,
    )
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
  })

  // tasks.md 2.2(c): `scan-fx-toggle` switches only which effect the BOARD
  // CANVAS draws for a running scan — with no board rendering, it is a dead
  // control. This is the board's implementing task for hex-board-view's
  // "Renderer Unavailability Is an Explicit State", Scenario: A canvas-only
  // control is disabled while the canvas is unavailable.
  it('available=false disables (or hides) scan-fx-toggle — a canvas-only control with nothing to draw to (Scenario: A canvas-only control is disabled while the canvas is unavailable)', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        available={false}
        scanFx="ping"
        onToggleScanFx={vi.fn()}
      />,
    )
    const toggle = screen.queryByTestId('scan-fx-toggle')
    if (toggle) {
      expect(toggle).toBeDisabled()
    } else {
      expect(toggle).not.toBeInTheDocument()
    }
  })

  it('available=true (and the default, omitted) leaves scan-fx-toggle operable', () => {
    const onToggleScanFx = vi.fn()
    const { rerender } = render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        available={true}
        scanFx="ping"
        onToggleScanFx={onToggleScanFx}
      />,
    )
    expect(screen.getByTestId('scan-fx-toggle')).toBeEnabled()
    fireEvent.click(screen.getByTestId('scan-fx-toggle'))
    expect(onToggleScanFx).toHaveBeenCalledTimes(1)

    // Defaulted (omitted entirely) behaves the same as explicit true — no
    // existing caller changes behaviour.
    rerender(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={ownFleet}
        plan={null}
        scanFx="ping"
        onToggleScanFx={onToggleScanFx}
      />,
    )
    expect(screen.getByTestId('scan-fx-toggle')).toBeEnabled()
  })
})
