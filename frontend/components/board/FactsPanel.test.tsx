// RED-phase suite for FactsPanel against the migrate-fleet-to-continuous-
// burns contract (design.md Decision 12; tasks.md 8.2, 8.7).
//
// Cause for rewriting this whole file wholesale: FactsPanel dropped its
// board.Cell/MovementState-shaped move/scan/cancel/depart verbs entirely —
// board-view REMOVED "Move Preview From the Acting Fleet's Live Position",
// "Move Commit", "Scan Aim Preview Only While Considering the Verb", "Scan
// Commit and Single-Slot Gating", "Cancel Command Available Only While
// Burning", and "Lane Gate Selection Previews and Commits Departure" with no
// successor on this panel (movement is commanded from the roster panel now,
// fleet-roster ADDED "The Roster Row Is the Fleet Command Surface"). The old
// `plan`/`route`/`onMove`/`onScan`/`onCancel`/`onDepart` props and the
// `scan-button`/`move-button`/`gate-facts` depart affordance/`cancel-button`
// testids have no successor on THIS component — see the deletion note below
// each removed describe block.
//
// What survives on FactsPanel (design.md Decision 12's "Kept" list, minus
// what SellSection.test.tsx / BalanceReadout.test.tsx already pin in
// isolation): the system header, credits, the fleet panel's hold readout,
// the mine offer/ETA/commit anchored on `activeFleet.attachedTo` (never a
// selection), the sell section's WIRING (composition, not its own internal
// logic), the selection facts (feature/cell/gate — informational only, no
// verb), and the `available` prop's effect on the empty-selection copy
// (add-renderer-availability-states; SDET regression carried forward from
// the pre-migration suite, task 2.2's own framing).

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FactsPanel } from './FactsPanel'
import type { BoardSelection } from './board-selection'
import type { Fleet } from '@/lib/types/fleet'
import { SHIP_MODE_BURN, SHIP_MODE_PARKED } from '@/lib/types/fleet'
import type { BoardFeature } from '@/lib/types/system-board'
import type { Quote } from '@/lib/types/market'

function parkState() {
  return {
    Mode: SHIP_MODE_PARKED,
    Burn: null,
    Park: {
      Kind: 2,
      BodyId: '',
      Radius: 0,
      PeriodMs: 0,
      Phase: 0,
      EpochMs: 0,
      Offset: { X: 0, Y: 0, Z: 0 },
      Point: { X: 0, Y: 0, Z: 0 },
    },
    Drift: null,
  }
}

function burnState(arriveMs: number) {
  return {
    Mode: SHIP_MODE_BURN,
    Burn: {
      Origin: { X: 0, Y: 0, Z: 0 },
      Target: { BodyId: 'p1', Point: null },
      Intercept: { X: 1, Y: 0, Z: 0 },
      Curve: {},
      Length: 10,
      DepartMs: 0,
      ArriveMs: arriveMs,
      Accel: 1,
      InsertionPhase: 0,
    },
    Park: null,
    Drift: null,
  }
}

const ownFleet: Fleet = {
  id: 'mine',
  corporationId: 'corp-user1',
  systemId: 's',
  state: parkState(),
  position: { X: 0, Y: 0, Z: 0 },
  own: true,
  worldTime: 0,
}

const base = {
  starClass: 'G',
  character: 'star_rich',
  radius: 16,
  featureCount: 4,
  features: [] as BoardFeature[],
  worldTime: 1_000_000,
  pending: false,
  onMine: vi.fn(),
}

function feature(over: Partial<BoardFeature> & { id: string }): BoardFeature {
  return { type: 'rocky', footprint: [{ ring: 2, slot: 0 }], band: 'visible', live: true, ...over }
}

describe('FactsPanel', () => {
  it('shows the system header — class, character, radius, and body count', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} />)
    expect(screen.getByText('Class G system')).toBeInTheDocument()
    expect(screen.getByText(/star rich · radius 16 · 4 bodies/i)).toBeInTheDocument()
  })

  it('shows the credit balance readout once a corporation exists, and hides it otherwise', () => {
    const { rerender } = render(
      <FactsPanel {...base} selection={null} activeFleet={null} credits={500} />,
    )
    expect(screen.getByTestId('balance-readout')).toBeInTheDocument()
    expect(screen.getByTestId('balance-value')).toHaveTextContent('500')

    rerender(<FactsPanel {...base} selection={null} activeFleet={null} credits={null} />)
    expect(screen.queryByTestId('balance-readout')).not.toBeInTheDocument()
  })

  it('shows no active-fleet section when there is no acting fleet', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} />)
    expect(screen.queryByTestId('active-fleet')).not.toBeInTheDocument()
  })

  it('badges a free-flying, undocked fleet correctly', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={ownFleet} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('free-flying')
  })

  it('badges a docked fleet correctly', () => {
    const docked: Fleet = { ...ownFleet, attachedTo: 'p1' }
    render(<FactsPanel {...base} selection={null} activeFleet={docked} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('docked')
  })

  it('badges a burning fleet correctly (an ArriveMs still ahead of worldTime)', () => {
    const burning: Fleet = { ...ownFleet, state: burnState(2_000_000) }
    render(<FactsPanel {...base} selection={null} activeFleet={burning} worldTime={1_000_000} />)
    expect(screen.getByTestId('active-fleet')).toHaveTextContent('burning')
  })

  // A burn whose ArriveMs has passed IS its settled state (design.md
  // Decision 1's trivial fold) — the badge must not still read "burning".
  it('folds a past-arrival burn to its settled (non-burning) badge', () => {
    const settled: Fleet = { ...ownFleet, state: burnState(500_000) }
    render(<FactsPanel {...base} selection={null} activeFleet={settled} worldTime={1_000_000} />)
    expect(screen.getByTestId('active-fleet')).not.toHaveTextContent('burning')
  })

  // --- mine (kept: "Mine Offer on the Docked Fleet", "Mine ETA Preview From
  // the Served Mining Rate", "Mine Commit") ----------------------------------

  const lodeFeature = feature({
    id: 'p1',
    resources: [
      { kind: 'metals', richness: 0.5 },
      { kind: 'water', richness: 0.8 },
    ],
  })
  // Docked to the lode (attachedTo, not a selection), with the owner-only
  // roster block: 12t of metals aboard, 188t free of 200, one seed hull's rate.
  const dockedMiner: Fleet = {
    ...ownFleet,
    attachedTo: 'p1',
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
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} features={[lodeFeature]} />,
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
    const onMine = vi.fn()
    render(
      <FactsPanel
        {...base}
        onMine={onMine}
        selection={null}
        activeFleet={dockedMiner}
        features={[lodeFeature]}
      />,
    )
    fireEvent.click(screen.getByTestId('mine-kind-metals'))
    expect(screen.getByTestId('mine-kind-metals')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('mine-kind-water')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByTestId('mine-button'))
    expect(onMine).toHaveBeenCalledWith('metals', 188)
  })

  it('refills the tonnage to the free hold via Fill hold', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} features={[lodeFeature]} />,
    )
    fireEvent.change(screen.getByTestId('mine-tons-input'), { target: { value: '60' } })
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(60)
    fireEvent.click(screen.getByTestId('mine-fill-hold'))
    expect(screen.getByTestId('mine-tons-input')).toHaveValue(188)
  })

  it('does not offer mine when merely present, not docked (attachedTo unset)', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={ownFleet} features={[lodeFeature]} />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
  })

  it('does not offer mine when the docked body has no visible resources', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        features={[feature({ id: 'p1' })]}
      />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
  })

  it('does not offer a fresh mine while the fleet is burning', () => {
    const burningDocked: Fleet = { ...dockedMiner, state: burnState(2_000_000) }
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={burningDocked}
        features={[lodeFeature]}
        worldTime={1_000_000}
      />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
  })

  it('clamps the tonnage input to the free hold', () => {
    render(
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} features={[lodeFeature]} />,
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
      <FactsPanel {...base} selection={null} activeFleet={dockedMiner} features={[lodeFeature]} />,
    )
    // 188t ÷ 0.001 t/ms = 188_000 ms → "3m".
    expect(screen.getByTestId('mine-eta')).toHaveTextContent('ETA 3m')
    // The served rate reads in human units: 0.001 t/ms = 60 t/min.
    expect(screen.getByTestId('mine-rate')).toHaveTextContent('at 60 t/min')
    fireEvent.change(screen.getByTestId('mine-tons-input'), { target: { value: '60' } })
    // 60t ÷ 0.001 = 60_000 ms → "1m".
    expect(screen.getByTestId('mine-eta')).toHaveTextContent('ETA 1m')
  })

  // "Fleet Panel Hold Readout" (kept)
  it('reads the hold: used/total capacity, tons by kind, and the free remainder', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={dockedMiner} />)
    expect(screen.getByTestId('hold-readout')).toBeInTheDocument()
    expect(screen.getByTestId('hold-capacity')).toHaveTextContent('12 / 200t')
    expect(screen.getByTestId('hold-metals')).toHaveTextContent('12t')
    expect(screen.getByTestId('hold-free')).toHaveTextContent('188t')
  })

  // PRODUCTION DEFECT FOUND BY THIS SDET (add-fuel-as-cargo — fleet-movement
  // MODIFIED "Fleet Cargo Pool": "Fuel occupies cargo capacity exactly like
  // a mined resource"): `HoldReadout`'s per-kind meter/list
  // (`RESOURCE_ACCENT[kind]`, this file) is keyed on `ResourceKind` alone
  // (metals/volatiles/water/organics/research/exotic) — `fuel` is
  // deliberately NOT a `ResourceKind` (fuel-as-cargo's own decision;
  // `system-interior` reserves the name from generation), yet
  // `fleet-movement` requires it to occupy the SAME `roster.cargo` map a
  // fleet's hold already renders through this exact component. A fleet
  // that holds ANY fuel today crashes this whole panel
  // (`RESOURCE_ACCENT['fuel']` is `undefined`, so `.meter`/`.dot` throw) —
  // not merely omits a fuel row. Reported to the orchestrator/developer as
  // a production defect this SDET found while authoring the refuel
  // surface's red-phase suite; NOT invented-around here. This test is the
  // failing reproduction — it must go green (no crash) once the hold
  // readout is made fuel-aware (e.g. its own accent entry, or fuel
  // rendered outside the per-`ResourceKind` accent map — an implementation
  // choice this SDET does not prescribe).
  it('does not crash when a docked fleet’s cargo includes fuel (fleet-movement "Fleet Cargo Pool")', () => {
    const fueled: Fleet = {
      ...dockedMiner,
      roster: { ...dockedMiner.roster!, cargo: { metals: 12, fuel: 40 } },
    }
    expect(() =>
      render(<FactsPanel {...base} selection={null} activeFleet={fueled} />),
    ).not.toThrow()
    expect(screen.getByTestId('hold-readout')).toBeInTheDocument()
  })

  it('shows a running mine as a countdown, blocking a fresh offer', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        features={[lodeFeature]}
        worldTime={5_000}
        mineEta={30_000}
      />,
    )
    expect(screen.queryByTestId('mine-section')).not.toBeInTheDocument()
    expect(screen.getByTestId('mine-countdown')).toHaveTextContent(/25s/)
  })

  it('lifts the mine gating once the eta passes, by world time alone', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        features={[lodeFeature]}
        worldTime={31_000}
        mineEta={30_000}
      />,
    )
    // Past-eta: the stale running entry stops gating — the offer returns.
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
    expect(screen.queryByTestId('mine-countdown')).not.toBeInTheDocument()
  })

  // --- sell (kept: the sell requirements, SellSection's OWN behaviour is
  // pinned by SellSection.test.tsx — this only checks FactsPanel's wiring)

  const quotes: Quote[] = [
    { kind: 'metals', entries: [{ unitPrice: 10, source: 'floor', unlimited: true }] },
  ]

  it('mounts the sell section only when docked at a station with live quotes and an onSell handler', () => {
    const onSell = vi.fn()
    const { rerender } = render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        stationQuotes={quotes}
        onSell={onSell}
      />,
    )
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()

    // No quotes (not docked at a station, or none live) → no sell section.
    rerender(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        stationQuotes={null}
        onSell={onSell}
      />,
    )
    expect(screen.queryByTestId('sell-section')).not.toBeInTheDocument()
  })

  it('commits a sale through the onSell prop, carrying the panel-chosen kind/tons/price', () => {
    const onSell = vi.fn()
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        stationQuotes={quotes}
        onSell={onSell}
      />,
    )
    fireEvent.click(screen.getByTestId('sell-button'))
    expect(onSell).toHaveBeenCalledWith('metals', 12, 10)
  })

  it('shows a re-priced offer notice when sellRepricedFrom is set', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        stationQuotes={quotes}
        onSell={vi.fn()}
        sellRepricedFrom={12}
      />,
    )
    expect(screen.getByTestId('sell-repriced')).toHaveTextContent(/12.*10/)
  })

  // --- refuel (add-fuel-as-cargo tasks.md 8.4; board-view ADDED "Refuel
  // Offer on the Docked Fleet") — FactsPanel's ONLY job is the GATING wire:
  // "docked at a station" (independent of whether that station's market
  // has anything sellable at all) plus the onRefuel commit hand-off.
  // RefuelSection's OWN internal behaviour (default tonnage, clamping, the
  // live price preview) is pinned in isolation by RefuelSection.test.tsx.
  //
  // CONTRACT ASSUMED BY THIS SDET: the gating signal FactsPanel already
  // receives for "is this fleet docked at THIS station" is `stationQuotes`
  // being non-null (SystemBoardView.tsx already computes
  // `stationQuotes={dockedAtStation ? stationQuotes : null}` — it is null
  // whenever the fleet is not docked there, regardless of whether the
  // station's market has any live quotes). Refuel reuses that SAME signal
  // (an EMPTY quotes array, `[]`, still means "docked, nothing to sell,
  // but fuel is still always for sale") rather than a new prop — a station
  // with nothing for sale must still offer refuel. The served fuel price
  // and free hold come straight off `activeFleet.roster` (extended with a
  // new `fuelPricePerTon` field — see FleetRoster.test.tsx's own contract
  // note), never a new top-level prop. `onRefuel` and `lastRefuelCost` are
  // the two genuinely NEW props this capability adds to `FactsPanelProps`.
  const dockedRefueler: Fleet = {
    ...dockedMiner,
    attachedTo: 'station-1',
    roster: { ...dockedMiner.roster!, fuelPricePerTon: 10 },
  }

  // Scenario: Refuel is offered while docked at a station — INCLUDING when
  // that station's market has nothing tradable at all (an empty quotes
  // array), proving the offer is anchored to "docked", never to "the
  // market has something for sale".
  it('offers refuel whenever docked at a station, even when the station’s market has nothing tradable', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedRefueler}
        stationQuotes={[]}
        onRefuel={vi.fn()}
      />,
    )
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
  })

  // Scenario: Refuel is not offered when merely co-located, not docked.
  it('does not offer refuel when the fleet is not docked at a station (stationQuotes null)', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedRefueler}
        stationQuotes={null}
        onRefuel={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('refuel-section')).not.toBeInTheDocument()
  })

  it('offers refuel beside the sell section when both apply', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={{ ...dockedRefueler, attachedTo: 'p1' }}
        stationQuotes={quotes}
        onSell={vi.fn()}
        onRefuel={vi.fn()}
      />,
    )
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
  })

  it('commits a refuel through the onRefuel prop, carrying the panel-chosen tonnage', () => {
    const onRefuel = vi.fn()
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedRefueler}
        stationQuotes={[]}
        onRefuel={onRefuel}
      />,
    )
    fireEvent.click(screen.getByTestId('refuel-button'))
    // The panel's own default tonnage (RefuelSection.test.tsx pins the
    // exact default derivation) — this only proves the wiring hands
    // WHATEVER tonnage the section holds back to the container, unaltered.
    expect(onRefuel).toHaveBeenCalledWith(expect.any(Number))
  })

  // fleet-movement "Fleet Read Serves the Configured Fuel Price, Never
  // Duplicated Client-Side" — the preview must reflect the ROSTER's served
  // price, proving FactsPanel reads it off `activeFleet.roster` rather than
  // any constant of its own.
  it('previews the refuel cost from the roster’s served fuel price, not a client constant', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={{
          ...dockedRefueler,
          roster: { ...dockedRefueler.roster!, freeHold: 100, fuelPricePerTon: 37 },
        }}
        stationQuotes={[]}
        onRefuel={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByTestId('refuel-tons-input'), { target: { value: '2' } })
    expect(screen.getByTestId('refuel-cost-preview')).toHaveTextContent('74')
  })

  // board-view MODIFIED "Credit Balance Readout" — "The balance visibly
  // updates when a refuel resolves". FactsPanel's own half: threading
  // `lastRefuelCost` through to BalanceReadout (BalanceReadout.test.tsx
  // pins that widget's own rendering/announcement in isolation).
  it('threads lastRefuelCost through to the balance readout', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedRefueler}
        stationQuotes={[]}
        onRefuel={vi.fn()}
        credits={860}
        lastRefuelCost={140}
      />,
    )
    expect(screen.getByTestId('balance-refuel-cost')).toHaveTextContent('140')
  })

  // --- selection facts (informational only — no move/scan/depart verb here
  // any more; movement is the roster panel's job, design.md Decision 12)

  it('shows a selected body’s facts, gated by fog band', () => {
    const visible = feature({ id: 'p1', type: 'rocky', band: 'visible' })
    render(
      <FactsPanel
        {...base}
        selection={{ kind: 'feature', id: 'p1' } as BoardSelection}
        activeFleet={null}
        features={[visible]}
      />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent('rocky')
    expect(screen.getByTestId('selection')).toHaveTextContent('LIVE')
  })

  it('ghosts a remembered body with its last-seen age; hides worth on astronomical', () => {
    const remembered = feature({ id: 'p1', band: 'remembered', asOf: 1_000_000 - 120_000 })
    const { rerender } = render(
      <FactsPanel
        {...base}
        selection={{ kind: 'feature', id: 'p1' } as BoardSelection}
        activeFleet={null}
        features={[remembered]}
      />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent(/last seen/i)

    const astro = feature({ id: 'p1', band: 'astronomical' })
    rerender(
      <FactsPanel
        {...base}
        selection={{ kind: 'feature', id: 'p1' } as BoardSelection}
        activeFleet={null}
        features={[astro]}
      />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent(/scan to reveal/i)
  })

  it('shows the ring/slot for a selected bare cell', () => {
    render(
      <FactsPanel
        {...base}
        selection={{ kind: 'cell', cell: { ring: 3, slot: 1 } } as BoardSelection}
        activeFleet={null}
      />,
    )
    expect(screen.getByTestId('selection')).toHaveTextContent('Ring 3, slot 1')
  })

  // A selected lane-gate body is 'feature'-shaped (replace-observation-
  // with-sightings tasks.md 4.12 — gates ARE bodies, `docs/plans/
  // continous_space/decisions.md`), named by its "gate-"+destSystemId
  // convention id. `board.features` never carries a gate body, so the panel
  // recognises one via its own `laneGates` prop (the interior read's served
  // lane gates) rather than a dedicated selection kind.
  it('describes a selected lane gate — no depart affordance, points at the roster panel', () => {
    render(
      <FactsPanel
        {...base}
        laneGates={[{ destSystemId: 'sys-neighbour', cell: { ring: 4, slot: 0 }, laneId: 'lane-here-neighbour' }]}
        selection={{ kind: 'feature', id: 'gate-sys-neighbour' } as BoardSelection}
        activeFleet={null}
      />,
    )
    const gateFacts = screen.getByTestId('gate-facts')
    expect(gateFacts).toHaveTextContent('sys-neighbour')
    expect(gateFacts).toHaveTextContent(/jump from the roster panel/i)
    expect(screen.queryByTestId('depart-button')).not.toBeInTheDocument()
  })

  // --- `available` (add-renderer-availability-states) — SDET regression
  // carried forward from the pre-migration suite's task 2.2 framing; no
  // move/scan verb survives to gate here, only the empty-selection copy.

  it('defaults `available` to true — the ordinary select-on-the-canvas prompt shows', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} />)
    expect(screen.getByTestId('selection-prompt')).toHaveTextContent(/select a body, tile, or gate/i)
  })

  it('available=false: the empty-selection prompt says the board must be available instead', () => {
    render(<FactsPanel {...base} selection={null} activeFleet={null} available={false} />)
    const prompt = screen.getByTestId('selection-prompt')
    expect(prompt).not.toHaveTextContent(/select a body, tile, or gate/i)
    expect(prompt).toHaveTextContent(/board/i)
    expect(prompt).toHaveTextContent(/available/i)
  })

  it('available=false does not affect the mine offer (still anchored to the docked state, never a selection)', () => {
    render(
      <FactsPanel
        {...base}
        selection={null}
        activeFleet={dockedMiner}
        features={[lodeFeature]}
        available={false}
      />,
    )
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
  })
})
