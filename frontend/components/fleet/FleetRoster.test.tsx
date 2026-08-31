// RED-phase suite for FleetRoster as the rebuilt command surface
// (migrate-fleet-to-continuous-burns, tasks.md 8.5, 8.8, 8.9;
// fleet-roster ADDED "One Row Per Owned Fleet, Derived From Kinematic
// State" / "The Roster Row Is the Fleet Command Surface"; board-view ADDED
// "Running Mine Gates the Fleet Panel's Commands").
//
// Cause for rewriting this whole file wholesale (not merely extending it):
// the spec changed — fleet-roster's REMOVED "One Row Per Owned Fleet,
// Derived From Effective State" named the five `board.MovementState` shapes
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
})
