// RED-phase suite for FleetRoster as the rebuilt command surface
// (migrate-fleet-to-continuous-burns, tasks.md 8.5, 8.8, 8.9;
// fleet-roster ADDED "One Row Per Owned Fleet, Derived From Kinematic
// State" / "The Roster Row Is the Fleet Command Surface"; board-view ADDED
// "Running Mine Gates the Fleet Panel's Commands").
//
// Cause for rewriting this whole file wholesale (not merely extending it):
// the spec changed — fleet-roster's REMOVED "One Row Per Owned Fleet,
// Derived From Effective State" named the five `MovementState` shapes the
// deleted board package carried,
// this file's fixtures (`coast`/`docked`/`laneTransit`) were built on; those
// shapes no longer exist on `Fleet['state']` (design.md Decision 4).
//
// New command-surface contract this test pins on `FleetRoster`:
//   - status/label rendering delegates to `./roster-status`'s
//     `rosterRowStatus` (already pinned in roster-status.test.ts) — this
//     file re-asserts only enough of it to prove the row is wired up, not
//     every derivation case.
//   - per-row command buttons, present only when
//     `./roster-commands`'s `rosterCommandVisibility` says so:
//       data-testid={`fleet-cmd-burn-${id}`}
//       data-testid={`fleet-cmd-cut-drive-${id}`}
//       data-testid={`fleet-cmd-stop-${id}`}
//       data-testid={`fleet-cmd-jump-${id}`}
//     each omitted from onClick args a plain fleet-command callback prop:
//     onBurn / onCutDrive / onStop / onJump — the ORDER TARGET (a body id or
//     point) is board-view's concern (Decision 12: "Targets are named by
//     body id from the interior read"), composed by whoever mounts the
//     roster from its own selection state, not collected inline here.
//   - `isChartedGate` is threaded in as a prop (the roster does not resolve
//     lane-gate charting itself — that lives with the mounting view's board
//     data).
//   - while `rosterMineGate` gates (a running mine's eta is still future),
//     burn/cut-drive/stop/jump render `disabled`, a countdown is shown (the
//     existing `fleet-row-eta-{id}` testid), and a
//     `data-testid={`fleet-cmd-cancel-mine-${id}`}` control appears that
//     invokes `useCancelAction`'s mutate with {actionId, fleetId} — the
//     SAME generic action-cancel hook the pre-migration board already used
//     for this exact purpose (hooks/use-actions.ts, untouched by section 8).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FleetRoster } from './FleetRoster'
import { useMyFleets } from '@/hooks/use-fleets'
import { useGalaxy } from '@/hooks/use-galaxy'
import { useCancelAction } from '@/hooks/use-actions'
import { queryKeys } from '@/lib/query-keys'
import type { Fleet } from '@/lib/types/fleet'
import type { GameAction } from '@/lib/types/action'

vi.mock('@/hooks/use-fleets', () => ({ useMyFleets: vi.fn() }))
vi.mock('@/hooks/use-galaxy', () => ({ useGalaxy: vi.fn() }))
vi.mock('@/hooks/use-actions', () => ({ useCancelAction: vi.fn() }))

const mockFleets = vi.mocked(useMyFleets)
const mockGalaxy = vi.mocked(useGalaxy)
const mockCancelAction = vi.mocked(useCancelAction)
const cancelMutate = vi.fn()

let qc: QueryClient
function render(ui: React.ReactElement) {
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const ModeBurn = 0
const ModeParked = 1
const ModeDrift = 2

function burnState(arriveMs: number) {
  return {
    Mode: ModeBurn,
    Burn: {
      Origin: { X: 0, Y: 0, Z: 0 },
      Target: { BodyId: 'body-1', Point: null },
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
function parkState() {
  return {
    Mode: ModeParked,
    Burn: null,
    Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: 0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    Drift: null,
  }
}
function driftState() {
  return { Mode: ModeDrift, Burn: null, Park: null, Drift: { Anchor: { X: 0, Y: 0, Z: 0 }, Velocity: { X: 1, Y: 0, Z: 0 }, EpochMs: 0 } }
}

function fleet(id: string, systemId: string, state: unknown, extra: Record<string, unknown> = {}): Fleet {
  return {
    id,
    corporationId: 'corp',
    systemId,
    state,
    position: { X: 0, Y: 0, Z: 0 },
    own: true,
    worldTime: 0,
    ...extra,
  } as unknown as Fleet
}

function setFleets(fleets: Fleet[]) {
  mockFleets.mockReturnValue({ data: fleets } as unknown as ReturnType<typeof useMyFleets>)
}

describe('FleetRoster — the command surface (fleet-roster ADDED, board-view ADDED)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockGalaxy.mockReturnValue({
      data: { nodes: [{ id: 'sys-0', name: 'Axion' }, { id: 'sys-1', name: 'Borealis' }] },
    } as unknown as ReturnType<typeof useGalaxy>)
    mockCancelAction.mockReturnValue({ mutate: cancelMutate, isPending: false } as unknown as ReturnType<
      typeof useCancelAction
    >)
    setFleets([])
  })

  // RED-PHASE ADDITION — openspec change `build-production-space-view`.
  // `fleet-roster`'s *Active and Here Highlighting* is MODIFIED by that
  // change (its wording retires the retired lattice view's "board"), and its
  // two scenarios had NO test at all: the behaviour is implemented in
  // `FleetRoster.tsx` (`data-active`, the "here" badge) and was never
  // asserted. A MODIFIED requirement with unasserted scenarios is exactly
  // the shape a copy edit can silently break.
  describe('Active and Here Highlighting', () => {
    // Scenario: The active fleet's row is marked
    it('Scenario: The active fleet\'s row is marked', () => {
      setFleets([fleet('f1', 'sys-0', parkState()), fleet('f2', 'sys-0', parkState())])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} activeFleetId="f2" />)
      expect(screen.getByTestId('fleet-row-f2')).toHaveAttribute('data-active', 'true')
      expect(
        screen.getByTestId('fleet-row-f1'),
        'exactly one row is the commanding one',
      ).toHaveAttribute('data-active', 'false')
      // ...and the distinction is visible, not attribute-only.
      expect(screen.getByTestId('fleet-row-f2').className).not.toBe(
        screen.getByTestId('fleet-row-f1').className,
      )
    })

    // Scenario: A fleet in the currently open board is marked "here"
    it('Scenario: A fleet in the currently open board is marked "here"', () => {
      setFleets([fleet('here-1', 'sys-0', parkState()), fleet('away-1', 'sys-9', parkState())])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} currentSystemId="sys-0" />)
      expect(screen.getByTestId('fleet-row-here-1')).toHaveTextContent(/here/i)
      expect(
        screen.getByTestId('fleet-row-away-1'),
        'a fleet in another system is not "here"',
      ).not.toHaveTextContent(/here/i)
    })

    it('SDET-added: with no system open, no row is marked "here"', () => {
      setFleets([fleet('f1', 'sys-0', parkState())])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
      expect(screen.getByTestId('fleet-row-f1')).not.toHaveTextContent(/here/i)
    })
  })

  // Scenario: Burn is always available
  it('always offers burn, regardless of kinematic state', () => {
    const burning = fleet('f1', 'sys-0', burnState(90_000))
    setFleets([burning])
    render(<FleetRoster worldTime={30_000} isChartedGate={() => false} />)
    expect(screen.getByTestId('fleet-cmd-burn-f1')).toBeInTheDocument()
  })

  // Scenario: Cut drive is offered only while burning / withheld outside a burn
  it('offers cut-drive only while burning', () => {
    setFleets([fleet('f1', 'sys-0', burnState(90_000))])
    render(<FleetRoster worldTime={30_000} isChartedGate={() => false} />)
    expect(screen.getByTestId('fleet-cmd-cut-drive-f1')).toBeInTheDocument()
  })

  it('withholds cut-drive for a parked fleet', () => {
    setFleets([fleet('f1', 'sys-0', parkState())])
    render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
    expect(screen.queryByTestId('fleet-cmd-cut-drive-f1')).not.toBeInTheDocument()
  })

  // Scenario: Stop in place is offered while burning or drifting
  //
  // Split from a single `it()` that rendered twice without unmounting
  // (A1: an SDET test-authoring defect, not a behaviour change — RTL v16
  // APPENDS a second container rather than replacing the first, so no
  // implementation could satisfy an assertion that the first render's DOM
  // is gone. `@testing-library/react`'s auto-cleanup (registered via the
  // global `afterEach` vitest.config.mjs's `globals: true` provides) tears
  // down between separate `it()`s, so each half gets a clean container.
  it('offers stop while drifting', () => {
    setFleets([fleet('f1', 'sys-0', driftState())])
    render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
    expect(screen.getByTestId('fleet-cmd-stop-f1')).toBeInTheDocument()
  })

  // Scenario: Stop in place is withheld while parked
  it('withholds stop while parked', () => {
    setFleets([fleet('f1', 'sys-0', parkState())])
    render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
    expect(screen.queryByTestId('fleet-cmd-stop-f1')).not.toBeInTheDocument()
  })

  // Scenario: Jump is offered only while attached to a charted gate
  //
  // Split for the same reason as the stop pair above (A1).
  it('offers jump while attached to a charted gate', () => {
    setFleets([fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })])
    render(<FleetRoster worldTime={0} isChartedGate={(id: string) => id === 'gate-1'} />)
    expect(screen.getByTestId('fleet-cmd-jump-f1')).toBeInTheDocument()
  })

  // Scenario: Jump is withheld at an uncharted gate
  it('withholds jump at an uncharted gate', () => {
    setFleets([fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })])
    render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
    expect(screen.queryByTestId('fleet-cmd-jump-f1')).not.toBeInTheDocument()
  })

  it('hands the fleet back to the mounting view on each command click', () => {
    const onBurn = vi.fn()
    const onCutDrive = vi.fn()
    const burning = fleet('f1', 'sys-0', burnState(90_000))
    setFleets([burning])
    render(<FleetRoster worldTime={30_000} isChartedGate={() => false} onBurn={onBurn} onCutDrive={onCutDrive} />)

    fireEvent.click(screen.getByTestId('fleet-cmd-burn-f1'))
    expect(onBurn).toHaveBeenCalledWith(burning)
    fireEvent.click(screen.getByTestId('fleet-cmd-cut-drive-f1'))
    expect(onCutDrive).toHaveBeenCalledWith(burning)
  })

  // board-view ADDED "Running Mine Gates the Fleet Panel's Commands"
  describe('the running-mine gate', () => {
    function seedRunningMine(fleetId: string, eta: number) {
      const mineAction: GameAction = {
        id: 'action_mine',
        type: 'mine',
        actor: fleetId,
        scope: 'sys-0',
        params: { featureId: 'p1', kind: 'metals', tons: 40 },
        committedAt: 0,
        eta,
        status: 'running',
        worldTime: 0,
      }
      qc.setQueryData(queryKeys.actions.running(fleetId), [mineAction])
    }

    it('disables burn/cut-drive/stop/jump and shows a countdown while a mine is running', () => {
      const docked = fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })
      setFleets([docked])
      seedRunningMine('f1', 90_000)

      render(<FleetRoster worldTime={30_000} isChartedGate={() => true} />)

      expect(screen.getByTestId('fleet-cmd-burn-f1')).toBeDisabled()
      expect(screen.getByTestId('fleet-cmd-jump-f1')).toBeDisabled()
      expect(screen.getByTestId('fleet-row-eta-f1')).toHaveTextContent('1m')
    })

    it('offers a cancel-mine control that invokes the generic action-cancel endpoint', () => {
      const docked = fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })
      setFleets([docked])
      seedRunningMine('f1', 90_000)

      render(<FleetRoster worldTime={30_000} isChartedGate={() => true} />)
      fireEvent.click(screen.getByTestId('fleet-cmd-cancel-mine-f1'))

      expect(cancelMutate).toHaveBeenCalledWith(
        expect.objectContaining({ actionId: 'action_mine', fleetId: 'f1' }),
        expect.anything(),
      )
    })

    // "leaving the fleet's kinematic state and attachment untouched" — the
    // roster issues no burn/cut-drive/stop/jump call as a side effect of
    // cancel-mine; only the cancel-action mutation fires.
    it('cancel-mine triggers no movement command as a side effect', () => {
      const onBurn = vi.fn()
      const onCutDrive = vi.fn()
      const onStop = vi.fn()
      const onJump = vi.fn()
      const docked = fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })
      setFleets([docked])
      seedRunningMine('f1', 90_000)

      render(
        <FleetRoster
          worldTime={30_000}
          isChartedGate={() => true}
          onBurn={onBurn}
          onCutDrive={onCutDrive}
          onStop={onStop}
          onJump={onJump}
        />,
      )
      fireEvent.click(screen.getByTestId('fleet-cmd-cancel-mine-f1'))

      expect(onBurn).not.toHaveBeenCalled()
      expect(onCutDrive).not.toHaveBeenCalled()
      expect(onStop).not.toHaveBeenCalled()
      expect(onJump).not.toHaveBeenCalled()
    })

    it('lifts the gate once the eta passes, with no navigation required', () => {
      const docked = fleet('f1', 'sys-0', parkState(), { attachedTo: 'gate-1' })
      setFleets([docked])
      seedRunningMine('f1', 90_000)

      render(<FleetRoster worldTime={91_000} isChartedGate={() => true} />)

      expect(screen.getByTestId('fleet-cmd-burn-f1')).not.toBeDisabled()
      expect(screen.queryByTestId('fleet-cmd-cancel-mine-f1')).not.toBeInTheDocument()
    })
  })

  // --- add-fuel-as-cargo tasks.md 8.1/8.2 — held fuel, estimated range, and
  // the persistent stranded indication (fleet-roster ADDED "The Roster Row
  // Shows Held Fuel and an Estimated Range" / "The Roster Row Shows a
  // Persistent Stranded Indication"). Both figures are asserted VERBATIM off
  // `roster` — this capability computes/derives neither (fleet-movement owns
  // the formulas; this roster only renders what the fleet read already
  // served).
  //
  // CONTRACT ASSUMED BY THIS SDET (RED phase, no backend contract landed
  // yet — confirm against the backend SDET's fleet-movement work before
  // implementing): the fleet read's owner-only `roster` block (`FleetRoster`,
  // lib/types/fleet.ts) gains two new fields — `estimatedRange: number` and
  // `stranded: boolean` — and `roster.cargo.fuel` carries the held fuel
  // tonnage through the EXISTING `cargo` map (fuel-as-cargo's own "fuel is a
  // reserved cargo kind" decision needs no new field for the tonnage
  // itself). If the developer lands these under different names, only the
  // fixture literals below need updating — the testids/assertions describe
  // the OBSERVABLE contract this SDET is pinning, not any particular field
  // name.
  describe('add-fuel-as-cargo ADDED — held fuel, estimated range, persistent stranded indication', () => {
    function rosterWith(over: Record<string, unknown>) {
      return {
        ships: [{ class: 'seed' }],
        cargo: { fuel: 0 },
        cargoCapacity: 200,
        freeHold: 200,
        miningRate: 0,
        estimatedRange: 0,
        stranded: false,
        fuelPricePerTon: 10,
        ...over,
      }
    }

    // Scenario: A roster row shows the fleet's held fuel and estimated range
    it('shows the fleet’s held fuel tonnage and its server-reported estimated range', () => {
      const f = fleet('f1', 'sys-0', parkState(), {
        roster: rosterWith({ cargo: { fuel: 42.5 }, estimatedRange: 833.25 }),
      })
      setFleets([f])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} />)

      expect(screen.getByTestId('fleet-fuel-f1')).toHaveTextContent('42.5')
      expect(screen.getByTestId('fleet-range-f1')).toHaveTextContent('833.25')
    })

    // Scenario: The roster never computes range client-side. A LARGE fuel
    // figure paired with a SMALL served range (the inverse of any obvious
    // fuel-to-range formula) proves the rendered number is the server's own
    // — a client-side re-derivation from fuel alone would show something
    // proportional to 999, not the served 1.
    it('renders the served range verbatim, never a client-side re-derivation from fuel', () => {
      const f = fleet('f1', 'sys-0', parkState(), {
        roster: rosterWith({ cargo: { fuel: 999 }, estimatedRange: 1 }),
      })
      setFleets([f])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} />)

      expect(screen.getByTestId('fleet-range-f1')).toHaveTextContent('1')
      expect(screen.getByTestId('fleet-range-f1')).not.toHaveTextContent('999')
    })

    // Scenario: A stranded fleet's roster row shows a persistent indication
    it('shows a persistent stranded indication when the read reports it, distinct from idle', () => {
      const stranded = fleet('f1', 'sys-0', parkState(), { roster: rosterWith({ stranded: true }) })
      setFleets([stranded])
      render(<FleetRoster worldTime={0} isChartedGate={() => false} />)

      const indicator = screen.getByTestId('fleet-stranded-f1')
      expect(indicator).toBeInTheDocument()
      // Distinguishable from the plain "idle" status text alone — a mere
      // "On station"/"Docked" label is not itself a stranded indication.
      expect(indicator.textContent?.toLowerCase()).toMatch(/strand/)
    })

    // Scenario: The indication persists across sessions and reloads — a
    // fresh mount with no prior interaction (no toast ever shown in THIS
    // render's lifetime) still shows it, because it is read straight off the
    // prop on every render, never from session-local state recording a past
    // warning.
    it('shows the indication on a completely fresh mount, with no prior commit-time warning ever rendered', () => {
      const stranded = fleet('f2', 'sys-0', parkState(), { roster: rosterWith({ stranded: true }) })
      setFleets([stranded])
      const { unmount } = render(<FleetRoster worldTime={0} isChartedGate={() => false} />)
      expect(screen.getByTestId('fleet-stranded-f2')).toBeInTheDocument()
      unmount()

      // A second, wholly independent mount (standing in for "a different
      // session, device, or reload") — same server-reported flag, same
      // result, with no state carried over from the first mount.
      render(<FleetRoster worldTime={12_345} isChartedGate={() => false} />)
      expect(screen.getByTestId('fleet-stranded-f2')).toBeInTheDocument()
    })

    // Scenario: A non-stranded fleet's roster row shows no stranded
    // indication — both while idle and while running an order.
    it('shows no stranded indication for a non-stranded fleet, whether idle or under way', () => {
      const idle = fleet('f1', 'sys-0', parkState(), { roster: rosterWith({ stranded: false }) })
      const burning = fleet('f2', 'sys-0', burnState(90_000), { roster: rosterWith({ stranded: false }) })
      setFleets([idle, burning])
      render(<FleetRoster worldTime={30_000} isChartedGate={() => false} />)

      expect(screen.queryByTestId('fleet-stranded-f1')).not.toBeInTheDocument()
      expect(screen.queryByTestId('fleet-stranded-f2')).not.toBeInTheDocument()
    })

    // SDET-added regression guard, not itself a spec scenario: the defect
    // this rename fixed was that the held-fuel/range/stranded testids shared
    // the `fleet-row-` prefix with the row's own `fleet-row-{id}` testid, so
    // `roster.locator('[data-testid^="fleet-row-"]')` — the locator three
    // e2e specs use to find "the row" — matched extra elements per fleet
    // instead of exactly one. Nothing at unit level pinned that property,
    // which is why the rename-to-collision slipped through to the e2e gate.
    // Render every held-fuel-block sibling at once (held fuel, range, AND
    // stranded) with no running order, so the pre-existing, explicitly
    // out-of-scope `fleet-row-eta-{id}` collision (only fires with a live
    // countdown; the e2e specs it could affect never hit that state at the
    // point they count rows) doesn't fold into this assertion — and pin
    // exactly one `fleet-row-`-prefixed element, which IS the row.
    it('SDET-added: exactly one fleet-row- prefixed testid per row, and it is the row itself', () => {
      const parked = fleet('f1', 'sys-0', parkState(), {
        roster: rosterWith({ cargo: { fuel: 5 }, estimatedRange: 10, stranded: true }),
      })
      setFleets([parked])
      const { container } = render(<FleetRoster worldTime={0} isChartedGate={() => false} />)

      const rowPrefixed = container.querySelectorAll('[data-testid^="fleet-row-"]')
      expect(rowPrefixed).toHaveLength(1)
      expect(rowPrefixed[0].getAttribute('data-testid')).toBe('fleet-row-f1')
    })
  })
})
