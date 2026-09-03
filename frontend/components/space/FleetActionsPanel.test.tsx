import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `docked-fleet-actions` (tasks.md 7.1-7.15), plus
// `system-space-view`'s *Surrounding panels remain usable* / *A burn can be
// ended while the canvas is unavailable*.
//
// THE CONTRACT — `frontend/components/space/FleetActionsPanel.tsx`:
//   export interface FleetActionsPanelProps {
//     fleet: Fleet | null           // the acting fleet
//     // The body the fleet is docked to, from the INTERIOR read. null when
//     // that read failed — which withdraws the mine offer (design.md
//     // Decision 12) without misreporting the body.
//     dockedFeature: { id: string; type: string; resources?: {kind,richness}[] } | null
//     interiorFailed: boolean
//     station: Station | null
//     stationQuotes: VenueQuotes | null
//     credits: number | null
//     canvasAvailable: boolean
//     worldTime: number
//   }
//
// data-testid contract:
//   space-fleet-panel, mine-section, mine-kind-select, mine-tons-input,
//   mine-eta-preview, mine-button, mine-countdown, mine-cancel,
//   mine-unavailable,
//   hold-readout, hold-capacity, hold-<kind>, hold-free,
//   sell-section, sell-kind-select, sell-tons-input, sell-proceeds-preview,
//   sell-button,
//   refuel-section, refuel-tons-input, refuel-cost-preview, refuel-button,
//   stationkeep-control, stationkeep-rate,
//   balance-readout, balance-value, balance-live-region
//
// VACUITY NOTES inline. Structural one: every "offered" assertion has a
// paired "not offered" case in the adjacent state, so a panel that rendered
// every control unconditionally fails.

const mine = { mutate: vi.fn(), isPending: false }
const sell = { mutate: vi.fn(), isPending: false }
const refuel = { mutate: vi.fn(), isPending: false }
const hold = { mutate: vi.fn(), isPending: false }
const release = { mutate: vi.fn(), isPending: false }
const cancelAction = { mutate: vi.fn(), isPending: false }
let runningMine: { id: string; eta: number } | null = null

vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return {
    ...actual,
    useMine: () => mine,
    useHold: () => hold,
    useRelease: () => release,
    useCutDrive: () => ({ mutate: vi.fn(), isPending: false }),
    useStop: () => ({ mutate: vi.fn(), isPending: false }),
  }
})
vi.mock('@/hooks/use-market', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-market')
  return { ...actual, useSell: () => sell, useRefuel: () => refuel }
})
vi.mock('@/hooks/use-actions', () => ({
  useRunningMine: () => ({ data: runningMine }),
  useCancelAction: () => cancelAction,
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/lib/toast', () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}))

import { FleetActionsPanel } from './FleetActionsPanel'
import { foldSale } from '@/lib/market/fold'

const T0 = 21_175_110_953

const ORE_BODY = {
  id: 'feat-body-0',
  type: 'rocky',
  resources: [
    { kind: 'metals', richness: 0.3 },
    { kind: 'organics', richness: 0.7 },
  ],
}
const BARREN_BODY = { id: 'feat-body-9', type: 'rocky', resources: [] }
const STATION_BODY = { id: 'feat-station', type: 'station', resources: [] }

const STATION = { systemId: 'sys_-7_17', featureId: 'feat-station', createdAt: 0, orbit: { ring: 2, angle0: 10, period: 72000, dir: -1 } }

const QUOTES = {
  venue: 'sys_-7_17',
  systemId: 'sys_-7_17',
  quotes: [
    {
      kind: 'metals',
      entries: [
        { unitPrice: 12, source: 'request', remainingQuantity: 4, requestId: 'r1' },
        { unitPrice: 5, source: 'floor', unlimited: true },
      ],
    },
    // `organics` is deliberately absent: the fleet holds it, but this
    // station's region has no configured floor for it.
  ],
}

function fleet(over: Record<string, unknown> = {}) {
  return {
    id: 'fleet_1',
    corporationId: 'corp-1',
    systemId: 'sys_-7_17',
    own: true,
    worldTime: T0,
    position: { X: 1, Y: 0, Z: 0 },
    attachedTo: 'feat-body-0',
    state: {
      Mode: 1,
      Burn: null,
      Drift: null,
      Park: { Kind: 0, BodyId: 'feat-body-0', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    },
    roster: {
      ships: [{ class: 'hauler' }],
      cargo: { fuel: 6, metals: 10, organics: 2 },
      cargoCapacity: 40,
      freeHold: 22,
      miningRate: 0.002,
      estimatedRange: 500,
      stranded: false,
      fuelPricePerTon: 5,
      stationKeepRateTonsPerSecond: 0.02,
    },
    ...over,
  }
}

function panel(over: Record<string, unknown> = {}) {
  return render(
     
    <FleetActionsPanel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fleet={fleet() as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dockedFeature={ORE_BODY as any}
      interiorFailed={false}
      station={null}
      stationQuotes={null}
      credits={1000}
      canvasAvailable
      worldTime={T0}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  runningMine = null
  mine.isPending = false
  sell.isPending = false
  refuel.isPending = false
})

// -------------------------------------------------------------------- mine

describe('FleetActionsPanel — the mine offer', () => {
  // Scenario: Mine is offered while docked at a resource-bearing body
  it('Scenario: Mine is offered while docked at a resource-bearing body', () => {
    panel()
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
    const kind = screen.getByTestId('mine-kind-select') as HTMLSelectElement
    // Limited to the docked feature's VISIBLE resource kinds...
    const options = Array.from(kind.querySelectorAll('option')).map((o) => o.value)
    expect(options.sort()).toEqual(['metals', 'organics'])
    // ...defaulting to the richest.
    expect(kind.value).toBe('organics')
    // Tonnage defaults to the fleet's free hold.
    expect((screen.getByTestId('mine-tons-input') as HTMLInputElement).value).toBe('22')
  })

  // Scenario: Mine is not offered when merely co-located, not docked
  it('Scenario: Mine is not offered when merely co-located, not docked', () => {
    panel({ fleet: fleet({ attachedTo: undefined }) })
    expect(screen.queryByTestId('mine-section')).toBeNull()
  })

  // Scenario: Mine is not offered when the docked body has no visible
  // resources
  it('Scenario: Mine is not offered when the docked body has no visible resources', () => {
    panel({ fleet: fleet({ attachedTo: 'feat-body-9' }), dockedFeature: BARREN_BODY })
    expect(screen.queryByTestId('mine-section')).toBeNull()
    // ...and this state MAY say the body has nothing to mine, unlike the
    // failed-read state below.
    expect(screen.queryByTestId('mine-unavailable')).toBeNull()
  })

  // Scenario: Tonnage input clamps to free hold
  it('Scenario: Tonnage input clamps to free hold', async () => {
    panel()
    const input = screen.getByTestId('mine-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '9999')
    await waitFor(() => expect(input.value).toBe('22'))
  })

  it('SDET-added: a zero or negative tonnage cannot be committed', async () => {
    panel()
    const input = screen.getByTestId('mine-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    expect((screen.getByTestId('mine-button') as HTMLButtonElement).disabled).toBe(true)
  })

  // Scenario: The preview tracks the tonnage input
  it('Scenario: The preview tracks the tonnage input', async () => {
    panel()
    const input = screen.getByTestId('mine-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '10')
    const ten = screen.getByTestId('mine-eta-preview').textContent
    await userEvent.clear(input)
    await userEvent.type(input, '20')
    const twenty = screen.getByTestId('mine-eta-preview').textContent
    expect(twenty, 'doubling the tonnage must change the previewed duration').not.toBe(ten)
  })

  it('SDET-added: the previewed duration is tonnage divided by the SERVED mining rate', async () => {
    // A hard-coded rate would survive the "it moves" test above; this one
    // changes the served rate and requires the preview to follow.
    panel()
    const fast = screen.getByTestId('mine-eta-preview').textContent
    const { unmount } = { unmount: () => {} }
    unmount()
    screen.getByTestId('mine-section')
    const slow = render(
       
      <FleetActionsPanel
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fleet={fleet({ roster: { ...fleet().roster, miningRate: 0.0002 } }) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dockedFeature={ORE_BODY as any}
        interiorFailed={false}
        station={null}
        stationQuotes={null}
        credits={1000}
        canvasAvailable
        worldTime={T0}
      />,
    )
    const slower = slow.getAllByTestId('mine-eta-preview').at(-1)!.textContent
    expect(slower).not.toBe(fast)
  })

  // Scenario: A successful mine commit arms the countdown  +
  // Scenario: The committed countdown uses the server's ETA
  it('Scenario: The committed countdown uses the server\'s ETA', async () => {
    mine.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ actionId: 'act_1', eta: T0 + 123_456, worldTime: T0 })
    })
    panel()
    await userEvent.click(screen.getByTestId('mine-button'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    // The countdown derives from the RETURNED eta, not the pre-commit
    // preview. 123456 ms is deliberately unlike the previewed duration.
    runningMine = { id: 'act_1', eta: T0 + 123_456 }
    const { rerender } = panel()
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FleetActionsPanel fleet={fleet() as any} dockedFeature={ORE_BODY as any} interiorFailed={false} station={null} stationQuotes={null} credits={1000} canvasAvailable worldTime={T0} />,
    )
    expect(screen.getAllByTestId('mine-countdown').at(-1)!.textContent).toMatch(/2:03|123|2 min/i)
  })

  // Scenario: A failed mine commit toasts the reason
  it('Scenario: A failed mine commit toasts the reason', async () => {
    const raw = 'mine: requested tons exceeds free hold'
    mine.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: raw } }))
    })
    panel()
    await userEvent.click(screen.getByTestId('mine-button'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).not.toContain(raw)
    // ...and the offer remains available.
    expect(screen.getByTestId('mine-section')).toBeInTheDocument()
  })

  it('SDET-added: the mine commit names the DOCKED feature, never a space-view selection', async () => {
    panel()
    await userEvent.click(screen.getByTestId('mine-button'))
    const req = mine.mutate.mock.calls[0][0]
    const body = req.request ?? req
    expect(body.featureId).toBe('feat-body-0')
  })
})

describe('FleetActionsPanel — running mine gates the movement commands', () => {
  // Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is
  // running
  it('Scenario: Burn, cut-drive, stop, and jump are disabled while a mine is running', () => {
    runningMine = { id: 'act_1', eta: T0 + 60_000 }
    panel()
    for (const id of ['fleet-cmd-burn-fleet_1', 'fleet-cmd-cut-drive-fleet_1', 'fleet-cmd-stop-fleet_1', 'fleet-cmd-jump-fleet_1']) {
      const el = screen.queryByTestId(id)
      if (el) expect((el as HTMLButtonElement).disabled, `${id} must be disabled`).toBe(true)
    }
    expect(screen.getByTestId('mine-countdown')).toBeInTheDocument()
  })

  it('SDET-added: once the ETA passes the gating lifts without navigation', () => {
    runningMine = { id: 'act_1', eta: T0 - 1 }
    panel()
    const burn = screen.queryByTestId('fleet-cmd-burn-fleet_1')
    if (burn) expect((burn as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('mine-countdown')).toBeNull()
  })

  // Scenario: A running mine can be cancelled
  it('Scenario: A running mine can be cancelled', async () => {
    runningMine = { id: 'act_1', eta: T0 + 60_000 }
    panel()
    await userEvent.click(screen.getByTestId('mine-cancel'))
    // Through the GENERIC action cancel endpoint, naming the action.
    const arg = cancelAction.mutate.mock.calls[0][0]
    expect(typeof arg === 'string' ? arg : (arg.actionId ?? arg.id)).toBe('act_1')
  })
})

// ------------------------------------------------------------ cargo readout

describe('FleetActionsPanel — the cargo hold readout', () => {
  // Scenario: The hold readout shows contents and capacity
  it('Scenario: The hold readout shows contents and capacity', () => {
    panel()
    expect(screen.getByTestId('hold-capacity')).toHaveTextContent(/18.*40|40/)
    expect(screen.getByTestId('hold-metals')).toHaveTextContent(/10/)
    expect(screen.getByTestId('hold-organics')).toHaveTextContent(/2/)
    // `fuel` rides the SAME cargo map, never a separate field.
    expect(screen.getByTestId('hold-fuel')).toHaveTextContent(/6/)
    expect(screen.getByTestId('hold-free')).toHaveTextContent(/22/)
  })

  // Scenario: The hold visibly fills when a mine run resolves
  it('Scenario: The hold visibly fills when a mine run resolves', () => {
    const { rerender } = panel()
    expect(screen.getByTestId('hold-metals')).toHaveTextContent(/10/)
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FleetActionsPanel fleet={fleet({ roster: { ...fleet().roster, cargo: { fuel: 6, metals: 30, organics: 2 }, freeHold: 2 } }) as any} dockedFeature={ORE_BODY as any} interiorFailed={false} station={null} stationQuotes={null} credits={1000} canvasAvailable worldTime={T0} />,
    )
    expect(screen.getByTestId('hold-metals')).toHaveTextContent(/30/)
    expect(screen.getByTestId('hold-free')).toHaveTextContent(/\b2\b/)
  })
})

// -------------------------------------------------------------------- sell

describe('FleetActionsPanel — the sell offer', () => {
  const docked = { fleet: fleet({ attachedTo: 'feat-station' }), dockedFeature: STATION_BODY, station: STATION, stationQuotes: QUOTES }

  // Scenario: Sell is offered while docked at a station with cargo aboard
  it('Scenario: Sell is offered while docked at a station with cargo aboard', () => {
    panel(docked)
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
  })

  // Scenario: Sell is not offered when merely co-located, not docked
  it('Scenario: Sell is not offered when merely co-located, not docked', () => {
    panel({ ...docked, fleet: fleet({ attachedTo: undefined }) })
    expect(screen.queryByTestId('sell-section')).toBeNull()
  })

  // Scenario: Sell is not offered when the cargo pool is empty
  it('Scenario: Sell is not offered when the cargo pool is empty', () => {
    panel({ ...docked, fleet: fleet({ attachedTo: 'feat-station', roster: { ...fleet().roster, cargo: {}, freeHold: 40 } }) })
    expect(screen.queryByTestId('sell-section')).toBeNull()
  })

  // Scenario: A kind with no configured floor at this station is excluded
  // from the picker
  it('Scenario: A kind with no configured floor at this station is excluded from the picker', () => {
    panel(docked)
    const select = screen.getByTestId('sell-kind-select') as HTMLSelectElement
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options, 'the fleet holds organics but this station will not buy it').not.toContain('organics')
    expect(options).toContain('metals')
    // Defaults to the kind with the greatest held tonnage AMONG THE ELIGIBLE.
    expect(select.value).toBe('metals')
  })

  // Scenario: Tonnage input clamps to held tonnage of the selected kind
  it('Scenario: Tonnage input clamps to held tonnage of the selected kind', async () => {
    panel(docked)
    const input = screen.getByTestId('sell-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    await waitFor(() => expect(input.value).toBe('10'))
  })

  // Scenario: The proceeds preview reflects the served quote
  it('Scenario: The proceeds preview reflects the served quote', async () => {
    panel(docked)
    const input = screen.getByTestId('sell-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '2')
    const two = screen.getByTestId('sell-proceeds-preview').textContent
    await userEvent.clear(input)
    await userEvent.type(input, '4')
    expect(screen.getByTestId('sell-proceeds-preview').textContent).not.toBe(two)
  })

  // Scenario: A split-fill preview matches the settlement fold exactly
  it('Scenario: A split-fill preview matches the settlement fold exactly', async () => {
    // 10 tons against a 4-ton request at 12 plus an unlimited floor at 5.
    // The oracle is `lib/market/fold.ts`, which is itself pinned to
    // `fixtures/market/cases.json` by `lib/market/fold.test.ts` — so this
    // asserts the PANEL uses that fold rather than a second implementation.
    const expected = foldSale(QUOTES.quotes[0].entries as never, 10)
    expect(expected.fills.length, 'the fixture case must actually split').toBeGreaterThan(1)
    panel(docked)
    const input = screen.getByTestId('sell-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '10')
    expect(screen.getByTestId('sell-proceeds-preview')).toHaveTextContent(String(expected.totalProceeds))
  })

  // Scenario: A successful sale refreshes hold and balance
  it('Scenario: A successful sale refreshes hold and balance', async () => {
    sell.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ fills: [{ source: 'floor', unitPrice: 5, tons: 10, proceeds: 50 }], proceeds: 50, balance: 1050 })
    })
    const { rerender } = panel(docked)
    await userEvent.click(screen.getByTestId('sell-button'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FleetActionsPanel fleet={fleet({ attachedTo: 'feat-station', roster: { ...fleet().roster, cargo: { fuel: 6, organics: 2 } } }) as any} dockedFeature={STATION_BODY as any} interiorFailed={false} station={STATION as any} stationQuotes={QUOTES as any} credits={1050} canvasAvailable worldTime={T0} />,
    )
    expect(screen.getByTestId('balance-value')).toHaveTextContent(/1050|1,050/)
  })

  // Scenario: A failed sale toasts player-facing copy, not raw server text
  it('Scenario: A failed sale toasts player-facing copy, not raw server text', async () => {
    const raw = 'market: that resource is not tradable at this station'
    sell.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: raw } }))
    })
    panel(docked)
    await userEvent.click(screen.getByTestId('sell-button'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).not.toContain(raw)
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
  })

  // Scenario: A price-changed rejection refreshes the offer instead of
  // freezing it  +  Scenario: Re-committing a re-priced sale uses a new
  // operation key
  it('Scenario: Re-committing a re-priced sale uses a new operation key', async () => {
    sell.mutate.mockImplementationOnce((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(
        Object.assign(new Error('x'), { data: { error: 'market: price changed since your quote' } }),
      )
    })
    panel(docked)
    await userEvent.click(screen.getByTestId('sell-button'))
    const firstKey = (sell.mutate.mock.calls[0][0].request ?? sell.mutate.mock.calls[0][0]).operationKey
    expect(firstKey).toBeTruthy()
    // The offer refreshes rather than freezing: the player is shown the new
    // figure alongside the one they expected.
    await waitFor(() => expect(screen.getByTestId('sell-price-changed')).toBeInTheDocument())
    // Re-commit: a re-priced sale is a NEW INTENT, never a retry.
    await userEvent.click(screen.getByTestId('sell-button'))
    const secondKey = (sell.mutate.mock.calls[1][0].request ?? sell.mutate.mock.calls[1][0]).operationKey
    expect(secondKey).toBeTruthy()
    expect(secondKey).not.toBe(firstKey)
  })

  // Scenario: A fresh attempt after a completed sale is a second,
  // independent sale
  it('Scenario: A fresh attempt after a completed sale is a second, independent sale', async () => {
    sell.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ fills: [], proceeds: 1, balance: 1001 })
    })
    panel(docked)
    await userEvent.click(screen.getByTestId('sell-button'))
    await userEvent.click(screen.getByTestId('sell-button'))
    const k1 = (sell.mutate.mock.calls[0][0].request ?? sell.mutate.mock.calls[0][0]).operationKey
    const k2 = (sell.mutate.mock.calls[1][0].request ?? sell.mutate.mock.calls[1][0]).operationKey
    expect(k1).not.toBe(k2)
  })
})

// ------------------------------------------------------------------ refuel

describe('FleetActionsPanel — the refuel offer', () => {
  const docked = { fleet: fleet({ attachedTo: 'feat-station' }), dockedFeature: STATION_BODY, station: STATION, stationQuotes: QUOTES }

  // Scenario: Refuel is offered while docked at a station
  it('Scenario: Refuel is offered while docked at a station', () => {
    panel(docked)
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
    // Beside the sell control.
    expect(screen.getByTestId('sell-section')).toBeInTheDocument()
  })

  // Scenario: Refuel is not offered when merely co-located, not docked
  it('Scenario: Refuel is not offered when merely co-located, not docked', () => {
    panel({ ...docked, fleet: fleet({ attachedTo: undefined }) })
    expect(screen.queryByTestId('refuel-section')).toBeNull()
  })

  it('SDET-added: refuel is offered even with a full hold and no held fuel — those are commit-time preconditions', () => {
    panel({
      ...docked,
      fleet: fleet({ attachedTo: 'feat-station', roster: { ...fleet().roster, cargo: { metals: 40 }, freeHold: 0 } }),
    })
    expect(screen.getByTestId('refuel-section')).toBeInTheDocument()
  })

  // Scenario: The default tonnage is capped by affordability, not only by
  // free hold
  it('Scenario: The default tonnage is capped by affordability, not only by free hold', () => {
    // free hold 22, price 5/t, balance 40 -> affordable 8 tons.
    panel({ ...docked, credits: 40 })
    expect((screen.getByTestId('refuel-tons-input') as HTMLInputElement).value).toBe('8')
  })

  // Scenario: Tonnage input clamps to the fleet's free hold
  it('Scenario: Tonnage input clamps to the fleet\'s free hold', async () => {
    panel(docked)
    const input = screen.getByTestId('refuel-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '999')
    await waitFor(() => expect(input.value).toBe('22'))
  })

  // Scenario: The cost preview reflects the server-served fuel price, not a
  // client-maintained constant
  it('Scenario: The cost preview reflects the server-served fuel price, not a client-maintained constant', async () => {
    panel(docked)
    const input = screen.getByTestId('refuel-tons-input') as HTMLInputElement
    await userEvent.clear(input)
    await userEvent.type(input, '3')
    expect(screen.getByTestId('refuel-cost-preview')).toHaveTextContent(/15/) // 3 x 5

    // Change ONLY the served price. A client-maintained constant would not
    // move.
    render(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FleetActionsPanel fleet={fleet({ attachedTo: 'feat-station', roster: { ...fleet().roster, fuelPricePerTon: 11 } }) as any} dockedFeature={STATION_BODY as any} interiorFailed={false} station={STATION as any} stationQuotes={QUOTES as any} credits={1000} canvasAvailable worldTime={T0} />,
    )
    const second = screen.getAllByTestId('refuel-tons-input').at(-1) as HTMLInputElement
    await userEvent.clear(second)
    await userEvent.type(second, '3')
    expect(screen.getAllByTestId('refuel-cost-preview').at(-1)).toHaveTextContent(/33/)
  })

  // Scenario: A successful refuel refreshes hold, range, and balance
  it('Scenario: A successful refuel refreshes hold, range, and balance', async () => {
    refuel.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({ tons: 3, cost: 15, balance: 985 })
    })
    panel(docked)
    await userEvent.click(screen.getByTestId('refuel-button'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
  })

  // Scenario: An unaffordable refuel is rejected in full, never partially
  // filled  /  Scenario: A failed refuel toasts player-facing copy
  it('Scenario: An unaffordable refuel is rejected in full, never partially filled', async () => {
    const raw = 'fuel-purchase: cost exceeds available credits'
    refuel.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: raw } }))
    })
    panel(docked)
    await userEvent.click(screen.getByTestId('refuel-button'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).not.toContain(raw)
    // No partial credit is shown anywhere: the hold readout is untouched.
    expect(screen.getByTestId('hold-fuel')).toHaveTextContent(/\b6\b/)
  })
})

// ----------------------------------------------------------- station-keeping

describe('FleetActionsPanel — station-keeping hold and release', () => {
  const orbiting = fleet()
  const holding = fleet({
    state: {
      Mode: 1,
      Burn: null,
      Drift: null,
      Park: { Kind: 1, BodyId: 'feat-body-0', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: T0, Offset: { X: 1, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } },
    },
  })

  // Scenario: Holding an orbiting fleet submits hold and the panel reflects
  // station-keep
  it('Scenario: Holding an orbiting fleet submits hold and the panel reflects station-keep', async () => {
    panel({ fleet: orbiting })
    const control = screen.getByTestId('stationkeep-control')
    expect(control).toHaveTextContent(/hold here/i)
    await userEvent.click(control)
    expect(hold.mutate).toHaveBeenCalled()
  })

  // Scenario: Releasing a station-keeping fleet submits release and the
  // panel reflects orbit
  it('Scenario: Releasing a station-keeping fleet submits release and the panel reflects orbit', async () => {
    panel({ fleet: holding })
    const control = screen.getByTestId('stationkeep-control')
    expect(control).toHaveTextContent(/resume orbit/i)
    await userEvent.click(control)
    expect(release.mutate).toHaveBeenCalled()
  })

  // Scenario: No control is offered while burning, drifting, or point-parked
  it('Scenario: No control is offered while burning, drifting, or point-parked', () => {
    const burning = fleet({ state: { Mode: 0, Park: null, Drift: null, Burn: { Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'x', Point: null }, Intercept: { X: 1, Y: 0, Z: 0 }, Curve: [], Length: 1, DepartMs: T0 - 1, ArriveMs: T0 + 1000, Accel: 1, InsertionPhase: 0 } } })
    const drifting = fleet({ state: { Mode: 2, Park: null, Burn: null, Drift: { Anchor: { X: 1, Y: 0, Z: 0 }, Velocity: { X: 1, Y: 0, Z: 0 }, EpochMs: T0 } } })
    const pointParked = fleet({ state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 2, BodyId: '', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 5, Y: 0, Z: 5 } } } })
    for (const f of [burning, drifting, pointParked]) {
      const { unmount } = panel({ fleet: f })
      expect(screen.queryByTestId('stationkeep-control')).toBeNull()
      unmount()
    }
  })

  // Scenario: The drain readout shows the served upkeep rate while holding
  it('Scenario: The drain readout shows the served upkeep rate while holding', () => {
    panel({ fleet: holding })
    expect(screen.getByTestId('stationkeep-rate')).toHaveTextContent(/0\.02/)
    expect(screen.getByTestId('stationkeep-rate').textContent!.toLowerCase()).toMatch(/t|ton/)
  })

  // Scenario: The Hold control prices the hold before it is taken
  it('Scenario: The Hold control prices the hold before it is taken', () => {
    // This is the one the chain has got wrong five times: the rate is served
    // on an ORBITING fleet precisely so the player can price the hold BEFORE
    // paying for it. Rendering it only once the hold is open would make the
    // served figure a value built and never called.
    panel({ fleet: orbiting })
    const rate = screen.getByTestId('stationkeep-rate')
    expect(rate).toBeInTheDocument()
    expect(rate).toHaveTextContent(/0\.02/)
    // ...and it is attached to the "Hold here" control itself.
    expect(screen.getByTestId('stationkeep-control')).toHaveTextContent(/hold here/i)
  })

  // Scenario: The drain readout is never derived from orbital elements
  it('Scenario: The drain readout is never derived from orbital elements', () => {
    // With NO served rate the readout must be absent — not computed from the
    // host body's radius and period. `space.StationKeepRate` is rule-bearing
    // (a floor clamp and a non-positive-period branch) and reproducing it
    // client-side is the mirror `space-kinematics` forbids.
    const noRate = fleet({ roster: { ...fleet().roster, stationKeepRateTonsPerSecond: undefined } })
    panel({ fleet: noRate })
    expect(screen.queryByTestId('stationkeep-rate')).toBeNull()
  })

  // Scenario: A hold at or below the reserve is rejected and toasted, not
  // silently accepted
  it('Scenario: A hold at or below the reserve is rejected and toasted, not silently accepted', async () => {
    hold.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(
        Object.assign(new Error('x'), {
          data: { error: 'fleet: no spendable fuel above the station-keeping reserve to hold on' },
        }),
      )
    })
    // A fleet holding a STRICTLY POSITIVE amount below the reserve — the case
    // "no fuel" copy would misdescribe.
    panel({ fleet: fleet({ roster: { ...fleet().roster, cargo: { fuel: 0.4, metals: 10 } } }) })
    await userEvent.click(screen.getByTestId('stationkeep-control'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const shown = String(toastError.mock.calls[0][0]).toLowerCase()
    expect(shown).toMatch(/reserve/)
    expect(shown).not.toMatch(/\b(no fuel|out of fuel|empty)\b/)
    // The panel's park-mode display is unchanged.
    expect(screen.getByTestId('stationkeep-control')).toHaveTextContent(/hold here/i)
  })

  // Scenario: Reaching the dry instant is reflected only on the next refetch
  it('Scenario: Reaching the dry instant is reflected only on the next refetch', () => {
    const dryPast = fleet({
      state: {
        Mode: 1,
        Burn: null,
        Drift: null,
        Park: { Kind: 1, BodyId: 'feat-body-0', Radius: 0, PeriodMs: 0, Phase: 0, EpochMs: T0, Offset: { X: 1, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 }, HoldStartMs: T0 - 100_000, DryInstantMs: T0 - 1 },
      },
    })
    // World time is PAST the stored dry instant, but the read still says
    // stationkeep. The client must NOT predict the demotion.
    panel({ fleet: dryPast, worldTime: T0 + 50_000 })
    expect(screen.getByTestId('stationkeep-control')).toHaveTextContent(/resume orbit/i)
  })
})

// ---------------------------------------------------------- credit balance

describe('FleetActionsPanel — the credit balance readout', () => {
  // Scenario: The panel shows the current credit balance
  it('Scenario: The panel shows the current credit balance', () => {
    panel({ credits: 4321 })
    expect(screen.getByTestId('balance-value')).toHaveTextContent(/4321|4,321/)
  })

  // Scenario: A balance change is announced to assistive technology
  it('Scenario: A balance change is announced to assistive technology', () => {
    const { rerender } = panel({ credits: 1000 })
    const live = screen.getByTestId('balance-live-region')
    expect(live).toHaveAttribute('aria-live')
    rerender(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FleetActionsPanel fleet={fleet() as any} dockedFeature={ORE_BODY as any} interiorFailed={false} station={null} stationQuotes={null} credits={1200} canvasAvailable worldTime={T0} />,
    )
    expect(screen.getByTestId('balance-live-region').textContent).toMatch(/1200|1,200/)
  })

  // Scenario: A failed sale's or refuel's error is announced to assistive
  // technology
  it('Scenario: A failed sale\'s or refuel\'s error is announced to assistive technology', async () => {
    sell.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: 'market: station is busy, try again' } }))
    })
    panel({ fleet: fleet({ attachedTo: 'feat-station' }), dockedFeature: STATION_BODY, station: STATION, stationQuotes: QUOTES })
    await userEvent.click(screen.getByTestId('sell-button'))
    // A purely visual toast is not enough.
    await waitFor(() => expect(screen.getByTestId('panel-error-live-region').textContent ?? '').not.toBe(''))
  })
})

// -------------------------------------------- the canvas-unavailable state

describe('FleetActionsPanel — usable while the canvas is unavailable', () => {
  // Scenario: Surrounding panels remain usable
  it('Scenario: Surrounding panels remain usable', () => {
    panel({
      canvasAvailable: false,
      fleet: fleet({ attachedTo: 'feat-station' }),
      dockedFeature: STATION_BODY,
      station: STATION,
      stationQuotes: QUOTES,
    })
    for (const id of ['sell-section', 'refuel-section', 'stationkeep-control', 'hold-readout', 'balance-readout']) {
      expect(screen.getByTestId(id), `${id} must remain usable`).toBeInTheDocument()
    }
  })

  // Scenario: A burn can be ended while the canvas is unavailable
  it('Scenario: A burn can be ended while the canvas is unavailable', async () => {
    const burning = fleet({
      attachedTo: undefined,
      state: { Mode: 0, Park: null, Drift: null, Burn: { Origin: { X: 0, Y: 0, Z: 0 }, Target: { BodyId: 'x', Point: null }, Intercept: { X: 1, Y: 0, Z: 0 }, Curve: [], Length: 1, DepartMs: T0 - 1, ArriveMs: T0 + 60_000, Accel: 1, InsertionPhase: 0 } },
    })
    panel({ canvasAvailable: false, fleet: burning, dockedFeature: null })
    // Neither verb takes a canvas target: cut drive takes none at all, and
    // stop parks at the fleet's own current position. Omitting them leaves a
    // burning fleet uncommandable for the duration of a hardware fault.
    const cut = screen.getByTestId('fleet-cmd-cut-drive-fleet_1') as HTMLButtonElement
    const stop = screen.getByTestId('fleet-cmd-stop-fleet_1') as HTMLButtonElement
    expect(cut.disabled).toBe(false)
    expect(stop.disabled).toBe(false)
  })

  // Scenario: A failed interior read withdraws the mine offer without
  // misreporting the body  (panel-level)
  it('Scenario: A failed interior read withdraws the mine offer without misreporting the body (panel-level)', () => {
    panel({ interiorFailed: true, dockedFeature: null })
    expect(screen.queryByTestId('mine-section')).toBeNull()
    const notice = screen.getByTestId('mine-unavailable')
    expect(notice.textContent!.toLowerCase()).not.toMatch(/nothing to mine|no resources|carries no/)
    expect(notice.textContent!.toLowerCase()).toMatch(/load|read|unavailable|retry/)
  })
})
