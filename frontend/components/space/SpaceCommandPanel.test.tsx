import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`: *Burn Preview Reflects the Server-Solved
// Order, Without Committing* (display half), *A Failed or Stale Preview Is
// Never Presented as a Current Quote* (display half), *A Burn Commit Is
// Quote-Locked to the Preview the Player Agreed To*, *Burn Commit Reports
// Its Outcome*, *A Commit's Actual Result Is Never Silently Swapped for the
// Previewed One*, *Burn Command Targets Any Selected Body, Lane Gate, or
// Point Uniformly*, *Jump Commit* (tasks.md 4.2-4.11, 6.3).
//
// THE CONTRACT — `frontend/components/space/SpaceCommandPanel.tsx`:
//   export interface SpaceCommandPanelProps {
//     fleet: Fleet | null            // the acting fleet
//     selection: SpaceSelection | null
//     gateFacts?: { bodyId: string; destSystemId: string } | null
//     canvasAvailable: boolean
//   }
// It reads the quote through `useBurnPreview` and commits through
// `useOrder` / `useJump`, per the component -> hook -> service layering.
//
// data-testid contract:
//   burn-button, preview-panel, preview-arrival, preview-deltav,
//   preview-fuel, preview-fuel-ceiling, preview-affordable,
//   preview-stranding, preview-no-quote, preview-retry, preview-stale,
//   burn-uncapped-label, commit-drift-notice, selection-prompt,
//   gate-facts, selection-facts
//
// ALLOWANCE FACTOR: `BURN_FUEL_ALLOWANCE` is a single named client constant
// exported from `@/lib/realtime`'s sibling `@/lib/space-quote`. design.md
// OQ-13 leaves its VALUE open, so nothing here asserts a number — only that
// the ceiling sent equals `fuelCostTons * BURN_FUEL_ALLOWANCE`, that the
// same figure is DISPLAYED, and that it is strictly above the point cost.
//
// VACUITY NOTE: every commit assertion reads the mutation mock's argument,
// so a panel that rendered a button and did nothing fails; every "shown"
// assertion is paired with a "not shown in the other state" assertion.

const order = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
const jump = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }
const previewState = {
  preview: null as unknown,
  stale: false,
  noQuote: false,
  retry: vi.fn(),
}

vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return { ...actual, useOrder: () => order, useJump: () => jump }
})
vi.mock('@/hooks/use-burn-preview', () => ({ useBurnPreview: () => previewState }))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/lib/toast', () => ({ toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) } }))

import { SpaceCommandPanel } from './SpaceCommandPanel'
import { BURN_FUEL_ALLOWANCE } from '@/lib/space-quote'
import { assertFiguresMatchModule } from '@/lib/format/assert-figures'

// MIGRATION NOTE (task 9.2, openspec change `add-figure-formatting`):
// `SpaceCommandPanel` gains a required `scale: number | undefined` prop
// AND a new `worldTime: number` prop (contract §10 F1 — every figure this
// panel converts is a remaining span against the mounting view's projected
// world time, which the panel did not previously receive at all). The
// `panel()` helper below supplies both by default. `commit-drift-notice`
// splits into four `<Figure>` elements (contract §4), each asserted
// independently, with the wrapper `<p>` keeping its id and carrying NO
// pair (case c).

const T0 = 21_175_110_953

const QUOTE = {
  controlPoints: [
    { X: 0, Y: 0, Z: 0 },
    { X: 1, Y: 0, Z: 0 },
    { X: 2, Y: 0, Z: 0 },
    { X: 3, Y: 0, Z: 0 },
    { X: 4, Y: 0, Z: 0 },
    { X: 5, Y: 0, Z: 0 },
  ],
  departMs: T0,
  arriveMs: T0 + 930_373,
  deltaV: 3721.492,
  fuelCostTons: 744.2984,
  affordable: true,
  strandingWarning: false,
}

const FLEET = {
  id: 'fleet_1',
  corporationId: 'corp-1',
  systemId: 'sys_-7_17',
  own: true,
  worldTime: T0,
  position: { X: 1, Y: 0, Z: 0 },
  attachedTo: undefined as string | undefined,
  laneId: undefined as string | undefined,
  state: { Mode: 1, Burn: null, Drift: null, Park: { Kind: 0, BodyId: 'feat-body-0', Radius: 4, PeriodMs: 6000, Phase: 0, EpochMs: T0, Offset: { X: 0, Y: 0, Z: 0 }, Point: { X: 0, Y: 0, Z: 0 } } },
  roster: { ships: [{ class: 'hauler' }], cargo: { fuel: 900 }, cargoCapacity: 1000, freeHold: 100, miningRate: 0.001 },
}

function panel(over: Record<string, unknown> = {}) {
  return render(
     
    <SpaceCommandPanel
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fleet={FLEET as any}
      selection={{ bodyId: 'feat-body-3' }}
      canvasAvailable
      worldTime={T0}
      scale={1}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  order.isPending = false
  jump.isPending = false
  previewState.preview = QUOTE
  previewState.stale = false
  previewState.noQuote = false
})

describe('SpaceCommandPanel — the preview overlay figures', () => {
  // Scenario: Selecting a target shows a preview curve and its figures
  it('Scenario: Selecting a target shows a preview curve and its figures', () => {
    const { container } = panel()
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    const arrival = screen.getByTestId('preview-arrival')
    expect(arrival).toHaveAttribute('data-unit', 'world-ms-span-in')
    // preview.arriveMs (T0 + 930_373) - worldTime (T0) = 930_373.
    expect(arrival).toHaveAttribute('data-raw', '930373')
    const deltav = screen.getByTestId('preview-deltav')
    expect(deltav).toHaveAttribute('data-unit', 'delta-v')
    expect(deltav).toHaveAttribute('data-raw', String(QUOTE.deltaV))
    expect(deltav).toHaveTextContent(/3721|3,721/)
    const fuel = screen.getByTestId('preview-fuel')
    expect(fuel).toHaveAttribute('data-unit', 'tons')
    expect(fuel).toHaveAttribute('data-raw', String(QUOTE.fuelCostTons))
    expect(fuel).toHaveTextContent(/744/)
    expect(screen.getByTestId('preview-affordable')).toHaveAttribute('data-affordable', 'true')
    assertFiguresMatchModule(container, { scale: 1 })
  })

  it('SDET-added: on a scale-less mount the arrival renders absent while delta-v/fuel/ceiling render normally (RULING 8/26)', () => {
    const { container } = panel({ scale: undefined })
    const arrival = screen.getByTestId('preview-arrival')
    expect(arrival).toHaveAttribute('data-raw', '930373')
    expect(arrival).toHaveTextContent('—')
    expect(screen.getByTestId('preview-deltav')).toHaveTextContent(/3721|3,721/)
    expect(screen.getByTestId('preview-fuel')).toHaveTextContent(/744/)
    assertFiguresMatchModule(container, { scale: undefined })
  })

  // Scenario: An unaffordable preview is shown as such
  it('Scenario: An unaffordable preview is shown as such', () => {
    previewState.preview = { ...QUOTE, affordable: false }
    panel()
    expect(screen.getByTestId('preview-affordable')).toHaveAttribute('data-affordable', 'false')
    // ...and visually distinct from the affordable state, not merely a
    // different attribute value.
    expect(screen.getByTestId('preview-panel').className).toMatch(/(rose|red|amber|warn)/i)
  })

  it('SDET-added: a stranding warning on the quote is surfaced', () => {
    previewState.preview = { ...QUOTE, strandingWarning: true }
    panel()
    expect(screen.getByTestId('preview-stranding')).toBeInTheDocument()
  })

  // Scenario: No displayed value is derived from a drawn position
  it('Scenario: No displayed value is derived from a drawn position', () => {
    // Every figure on this panel comes from the SERVED quote. Changing only
    // the served numbers must change every displayed number; if a figure
    // were recomputed from a drawn position it would not move.
    previewState.preview = { ...QUOTE, deltaV: 11.5, fuelCostTons: 2.3, arriveMs: T0 + 7 }
    const { container } = panel()
    // deltaV is now an INTEGER m/s figure (R7): 11.5 ties away from zero to
    // 12, so the raw value — not the rounded display text — is what proves
    // the figure tracks the served quote.
    expect(screen.getByTestId('preview-deltav')).toHaveAttribute('data-raw', '11.5')
    expect(screen.getByTestId('preview-fuel')).toHaveAttribute('data-raw', '2.3')
    expect(screen.getByTestId('preview-fuel')).toHaveTextContent(/2\.3/)
    expect(screen.getByTestId('preview-deltav')).not.toHaveTextContent(/3721/)
    assertFiguresMatchModule(container, { scale: 1 })
  })
})

describe('SpaceCommandPanel — failed and stale quotes', () => {
  // Scenario: A failed first preview shows a no-quote state, not empty
  // figures
  it('Scenario: A failed first preview shows a no-quote state, not empty figures', () => {
    previewState.preview = null
    previewState.noQuote = true
    panel()
    expect(screen.getByTestId('preview-no-quote')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-arrival')).toBeNull()
    expect(screen.queryByTestId('preview-deltav')).toBeNull()
    expect(screen.queryByTestId('preview-fuel')).toBeNull()
  })

  // Scenario: A failed first preview offers a retry
  it('Scenario: A failed first preview offers a retry', async () => {
    previewState.preview = null
    previewState.noQuote = true
    panel()
    await userEvent.click(screen.getByTestId('preview-retry'))
    expect(previewState.retry).toHaveBeenCalled()
  })

  // Scenario: A failed refresh marks the shown figures stale
  it('Scenario: A failed refresh marks the shown figures stale', async () => {
    previewState.stale = true
    panel()
    expect(screen.getByTestId('preview-stale')).toBeInTheDocument()
    // The figures are still SHOWN — marked, not withdrawn.
    expect(screen.getByTestId('preview-deltav')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('preview-retry'))
    expect(previewState.retry).toHaveBeenCalled()
  })

  // Scenario: A later successful refresh clears the stale marking
  it('Scenario: A later successful refresh clears the stale marking', () => {
    // Asserted BOTH ways: the marking is gone AND the newest figures are
    // shown as current. Absence alone would pass against a panel that
    // rendered nothing at all.
    previewState.stale = false
    previewState.preview = { ...QUOTE, deltaV: 4444.4 }
    panel()
    expect(screen.queryByTestId('preview-stale')).toBeNull()
    expect(screen.getByTestId('preview-deltav')).toHaveTextContent(/4444|4,444/)
  })

  // Scenario: The burn stays committable without a quote, labelled as
  // uncapped
  it('Scenario: The burn stays committable without a quote, labelled as uncapped', async () => {
    previewState.preview = null
    previewState.noQuote = true
    panel()
    const btn = screen.getByTestId('burn-button')
    expect((btn as HTMLButtonElement).disabled, 'a transient preview failure must not make the core verb unreachable').toBe(false)
    expect(screen.getByTestId('burn-uncapped-label')).toBeInTheDocument()
    await userEvent.click(btn)
    expect(order.mutate).toHaveBeenCalled()
    const req = order.mutate.mock.calls[0][0]
    expect(Object.prototype.hasOwnProperty.call(req.request ?? req, 'maxFuelTons')).toBe(false)
  })

  // Scenario: A stale figure never becomes a cap
  it('Scenario: A stale figure never becomes a cap', async () => {
    previewState.stale = true
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    const req = order.mutate.mock.calls[0][0]
    const body = req.request ?? req
    expect(Object.prototype.hasOwnProperty.call(body, 'maxFuelTons')).toBe(false)
    expect(screen.getByTestId('burn-uncapped-label')).toBeInTheDocument()
  })
})

describe('SpaceCommandPanel — the quote lock', () => {
  // Scenario: A commit with a current preview carries a cap
  it('Scenario: A commit with a current preview carries a cap', async () => {
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    const body = order.mutate.mock.calls[0][0].request ?? order.mutate.mock.calls[0][0]
    expect(body.maxFuelTons).toBeCloseTo(QUOTE.fuelCostTons * BURN_FUEL_ALLOWANCE, 6)
  })

  // Scenario: The ceiling the player agrees to is the one displayed
  it('Scenario: The ceiling the player agrees to is the one displayed', async () => {
    panel()
    const ceiling = QUOTE.fuelCostTons * BURN_FUEL_ALLOWANCE
    expect(BURN_FUEL_ALLOWANCE, 'the allowance must leave real slack').toBeGreaterThan(1)
    const shown = screen.getByTestId('preview-fuel-ceiling')
    // The DISPLAYED ceiling is the figure actually sent, not the point cost
    // — asserted via data-raw, which survives figure-formatting's rounding
    // regardless of the allowance factor's value (a formatted-text regex
    // built from `Math.floor(ceiling)` would be fragile against rounding).
    expect(shown).toHaveAttribute('data-unit', 'tons')
    expect(Number(shown.getAttribute('data-raw'))).toBeCloseTo(ceiling, 6)
    expect(screen.getByTestId('preview-fuel')).toHaveTextContent(/744/)
    await userEvent.click(screen.getByTestId('burn-button'))
    const body = order.mutate.mock.calls[0][0].request ?? order.mutate.mock.calls[0][0]
    expect(body.maxFuelTons).toBeCloseTo(ceiling, 6)
  })

  // Scenario: A cap rejection re-quotes in flow instead of failing the
  // interaction
  it('Scenario: A cap rejection re-quotes in flow instead of failing the interaction', async () => {
    order.mutate.mockImplementation((_vars: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(
        Object.assign(new Error('rejected'), {
          data: { error: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap', fuelCostTons: 901.2 },
        }),
      )
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    // A fresh preview is requested...
    await waitFor(() => expect(previewState.retry).toHaveBeenCalled())
    // ...the new figures are presented for RE-CONFIRMATION...
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    // ...and the order is NOT retried automatically at the higher cost.
    expect(order.mutate).toHaveBeenCalledTimes(1)
  })
})

describe('SpaceCommandPanel — commit outcome reporting', () => {
  // Scenario: A successful burn commit reports success
  it('Scenario: A successful burn commit reports success', async () => {
    order.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({
        ...FLEET,
        state: { Mode: 0, Park: null, Drift: null, Burn: { ...QUOTE, ArriveMs: QUOTE.arriveMs, DeltaV: QUOTE.deltaV } },
      })
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    const shown = String(toastSuccess.mock.calls[0][0])
    // R12's toast/aria-label exemption: the toast uses the shared formatter
    // and carries no data-raw/data-unit of its own, but it must NEVER
    // interpolate the raw world-ms arrival — RULING 12, proposal.md's own
    // headline defect.
    expect(shown, 'never the raw world-ms arrival integer').not.toContain(String(QUOTE.arriveMs))
    // ArriveMs (QUOTE.arriveMs) - worldTime (T0) = 930_373ms = "in 15m 30s".
    expect(shown, 'the served arrival time must be carried as a formatted relative duration').toContain(
      'in 15m 30s',
    )
  })

  // Scenario: A failed burn commit reports the mapped reason
  it('Scenario: A failed burn commit reports the mapped reason', async () => {
    const raw = 'fleet: fuel cost exceeds available fuel'
    order.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: raw } }))
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const shown = String(toastError.mock.calls[0][0])
    expect(shown, 'never the raw reason string').not.toContain(raw)
    expect(shown).not.toMatch(/^fleet:/)
    // ...and the selection is unchanged.
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
  })

  // Scenario: A burn commit failure with no distinguishable reason still
  // reports safely
  it('Scenario: A burn commit failure with no distinguishable reason still reports safely', async () => {
    order.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(new Error('API Error: 500 Internal Server Error'))
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const shown = String(toastError.mock.calls[0][0])
    expect(shown).not.toMatch(/API Error|500|Internal Server/)
  })

  // Scenario: A commit matching the preview shows no drift notice
  it('Scenario: A commit matching the preview shows no drift notice', async () => {
    order.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({
        ...FLEET,
        state: { Mode: 0, Park: null, Drift: null, Burn: { ArriveMs: QUOTE.arriveMs, DeltaV: QUOTE.deltaV, DepartMs: QUOTE.departMs, Curve: QUOTE.controlPoints } },
      })
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled())
    expect(screen.queryByTestId('commit-drift-notice')).toBeNull()
  })

  // Scenario: A commit differing from the preview surfaces both figures
  it('Scenario: A commit differing from the preview surfaces both figures', async () => {
    order.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({
        ...FLEET,
        state: { Mode: 0, Park: null, Drift: null, Burn: { ArriveMs: QUOTE.arriveMs + 40_000, DeltaV: QUOTE.deltaV + 60, DepartMs: QUOTE.departMs, Curve: QUOTE.controlPoints } },
      })
    })
    const { container } = panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    const notice = await screen.findByTestId('commit-drift-notice')
    // The wrapper keeps its id and carries NO pair (case c); each of the
    // four figures is its own element with its own raw value.
    expect(notice).not.toHaveAttribute('data-raw')
    const actualDeltav = screen.getByTestId('commit-drift-actual-deltav')
    const previewedDeltav = screen.getByTestId('commit-drift-previewed-deltav')
    const actualArrival = screen.getByTestId('commit-drift-actual-arrival')
    const previewedArrival = screen.getByTestId('commit-drift-previewed-arrival')
    expect(actualDeltav).toHaveAttribute('data-unit', 'delta-v')
    expect(actualDeltav).toHaveAttribute('data-raw', String(QUOTE.deltaV + 60))
    expect(actualDeltav).toHaveTextContent(/3781|3,781/)
    expect(previewedDeltav).toHaveAttribute('data-raw', String(QUOTE.deltaV))
    expect(previewedDeltav).toHaveTextContent(/3721|3,721/)
    // Both arrivals take the SAME `in` direction form (RULING 24) — never
    // one `in` beside one `left`.
    expect(actualArrival).toHaveAttribute('data-unit', 'world-ms-span-in')
    expect(actualArrival).toHaveAttribute('data-raw', String(QUOTE.arriveMs + 40_000 - T0))
    expect(previewedArrival).toHaveAttribute('data-unit', 'world-ms-span-in')
    expect(previewedArrival).toHaveAttribute('data-raw', String(QUOTE.arriveMs - T0))
    expect(toastSuccess, 'the success feedback is still shown').toHaveBeenCalled()
    assertFiguresMatchModule(container, { scale: 1 })
  })

  // Scenario: An uncapped commit still surfaces its actual figures
  it('Scenario: An uncapped commit still surfaces its actual figures', async () => {
    previewState.preview = null
    previewState.noQuote = true
    order.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({
        ...FLEET,
        state: { Mode: 0, Park: null, Drift: null, Burn: { ArriveMs: T0 + 12_345, DeltaV: 88.5, DepartMs: T0, Curve: [] } },
      })
    })
    panel()
    await userEvent.click(screen.getByTestId('burn-button'))
    const notice = await screen.findByTestId('commit-drift-notice')
    // deltaV rounds to an integer now (88.5 ties away from zero to 89), so
    // the raw value — not the pre-migration "88.5" text — proves the
    // actual figure carries the served quote.
    const actualDeltav = screen.getByTestId('commit-drift-actual-deltav')
    expect(actualDeltav).toHaveAttribute('data-raw', '88.5')
    expect(notice).toHaveTextContent(/no quote had been shown/i)
    // No quote had been shown, so no PREVIEWED figures exist at all.
    expect(screen.queryByTestId('commit-drift-previewed-deltav')).toBeNull()
    expect(screen.queryByTestId('commit-drift-previewed-arrival')).toBeNull()
  })
})

describe('SpaceCommandPanel — one uniform burn command path', () => {
  // Scenario: Commanding a burn toward a selected lane-gate body submits an
  // order
  it('Scenario: Commanding a burn toward a selected lane-gate body submits an order', async () => {
    panel({ selection: { bodyId: 'gate-sys_-6_16' }, gateFacts: { bodyId: 'gate-sys_-6_16', destSystemId: 'sys_-6_16' } })
    await userEvent.click(screen.getByTestId('burn-button'))
    const body = order.mutate.mock.calls[0][0].request ?? order.mutate.mock.calls[0][0]
    expect(body.bodyId).toBe('gate-sys_-6_16')
    expect(body.point).toBeUndefined()
  })

  // Scenario: Commanding a burn toward a selected point in space submits an
  // order
  it('Scenario: Commanding a burn toward a selected point in space submits an order', async () => {
    panel({ selection: { point: { x: 210, y: 0, z: -140 } } })
    await userEvent.click(screen.getByTestId('burn-button'))
    const body = order.mutate.mock.calls[0][0].request ?? order.mutate.mock.calls[0][0]
    expect(body.point).toEqual({ X: 210, Y: 0, Z: -140 })
    expect(body.bodyId).toBeUndefined()
  })

  // Scenario: No lane-gate-specific or point-specific refusal copy exists
  it('Scenario: No lane-gate-specific or point-specific refusal copy exists', async () => {
    for (const selection of [
      { bodyId: 'gate-sys_-6_16' },
      { point: { x: 1, y: 0, z: 2 } },
      { bodyId: 'feat-body-3' },
    ]) {
      vi.clearAllMocks()
      const { unmount } = panel({ selection })
      await userEvent.click(screen.getByTestId('burn-button'))
      expect(toastError, `${JSON.stringify(selection)} must submit, not refuse`).not.toHaveBeenCalled()
      expect(order.mutate).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('selection-prompt')).toBeNull()
      unmount()
    }

    // The "select a target first" refusal is reachable ONLY from an empty
    // selection.
    vi.clearAllMocks()
    panel({ selection: null })
    expect(screen.getByTestId('selection-prompt')).toBeInTheDocument()
    expect((screen.getByTestId('burn-button') as HTMLButtonElement).disabled).toBe(true)
  })

  // Scenario: A selected gate still shows its facts and its selected mark
  it('Scenario: A selected gate still shows its facts and its selected mark (the facts half)', () => {
    panel({ selection: { bodyId: 'gate-sys_-6_16' }, gateFacts: { bodyId: 'gate-sys_-6_16', destSystemId: 'sys_-6_16' } })
    const facts = screen.getByTestId('gate-facts')
    expect(facts, 'the destination system must be named').toHaveTextContent(/sys_-6_16/)
    // A gate-aware LOOKUP used only to present the gate's facts is expressly
    // NOT a forbidden kind-specific branch — this same requirement mandates
    // the presentation.
  })
})

describe('SpaceCommandPanel — jump commit', () => {
  const attached = {
    ...FLEET,
    attachedTo: 'gate-sys_-6_16',
    laneId: 'lane_-7_17_-6_16',
  }

  // Scenario: Invoking jump submits the attached gate's lane
  it('Scenario: Invoking jump submits the attached gate\'s lane', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const call = jump.mutate.mock.calls[0][0]
    expect(call.laneId ?? call.request?.laneId).toBe('lane_-7_17_-6_16')
  })

  // Scenario: A gate whose lane the corporation has not charted still
  // commits
  it('Scenario: A gate whose lane the corporation has not charted still commits', async () => {
    // No charted-lane set is consulted at all: the id comes from the
    // fleet's own read, and from no other source.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null, chartedLanes: [] as string[] })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    expect(jump.mutate).toHaveBeenCalledTimes(1)
    expect(toastError).not.toHaveBeenCalled()
  })

  // Scenario: A fleet attached to a gate in another system still commits
  it('Scenario: A fleet attached to a gate in another system still commits', async () => {
    const elsewhere = { ...attached, systemId: 'sys_-9_9', laneId: 'lane_-9_9_-9_10' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: elsewhere as any, selection: null })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const call = jump.mutate.mock.calls[0][0]
    expect(
      call.laneId ?? call.request?.laneId,
      'never this system\'s like-named gate',
    ).toBe('lane_-9_9_-9_10')
  })

  // Scenario: Jump still commits when the interior read has failed
  it('Scenario: Jump still commits when the interior read has failed', async () => {
    // The panel is given NO gate facts at all — the state a failed interior
    // read produces. The lane id still comes from the fleet's own read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null, gateFacts: null, canvasAvailable: false })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    const call = jump.mutate.mock.calls[0][0]
    expect(call.laneId ?? call.request?.laneId).toBe('lane_-7_17_-6_16')
  })

  // Scenario: A failed jump commit toasts the reason
  it('Scenario: A failed jump commit toasts the reason', async () => {
    const raw = 'fleet: jump requires attachment to the lane\'s own gate body'
    jump.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(Object.assign(new Error('x'), { data: { error: raw } }))
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(String(toastError.mock.calls[0][0])).not.toContain(raw)
  })

  // Scenario: A destination-not-ready rejection toasts as retryable, not
  // generically
  it('Scenario: A destination-not-ready rejection toasts as retryable, not generically', async () => {
    jump.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      opts?.onError?.(
        Object.assign(new Error('x'), {
          data: { error: "fleet: destination's lane horizon could not be materialized" },
        }),
      )
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const shown = String(toastError.mock.calls[0][0]).toLowerCase()
    expect(shown, 'the copy must tell the player it can be retried').toMatch(/again|retry|moment/)
  })

  // Scenario: A jump against a fleet the requester does not own toasts
  // generically  /  Scenario: A failure with no distinguishable reason still
  // toasts safely
  it('Scenario: A jump against a fleet the requester does not own toasts generically', async () => {
    jump.mutate.mockImplementation((_v: unknown, opts?: { onError?: (e: unknown) => void }) => {
      // A BODYLESS 404 — indistinguishable from a nonexistent fleet.
      opts?.onError?.(new Error('API Error: 404 Not Found'))
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ fleet: attached as any, selection: null })
    await userEvent.click(screen.getByTestId('fleet-cmd-jump-fleet_1'))
    await waitFor(() => expect(toastError).toHaveBeenCalled())
    const shown = String(toastError.mock.calls[0][0]).toLowerCase()
    expect(shown, 'no copy may distinguish a foreign fleet from a nonexistent one').not.toMatch(
      /own|belongs|permission|forbidden|another corporation/,
    )
    expect(shown).not.toMatch(/404|api error/)
  })
})

describe('SpaceCommandPanel — burn target selection is unreachable without the canvas', () => {
  // Scenario: Burn target selection is unreachable without the canvas
  it('Scenario: Burn target selection is unreachable without the canvas', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    panel({ canvasAvailable: false, selection: null, fleet: { ...FLEET, attachedTo: 'gate-sys_-6_16', laneId: 'lane_-7_17_-6_16' } as any })
    // The prompt must NOT instruct the player to select a body, gate or
    // point while no canvas exists to select one on.
    const prompt = screen.queryByTestId('selection-prompt')
    if (prompt) {
      expect(prompt.textContent!.toLowerCase()).not.toMatch(/select a (body|gate|point|target)/)
    }
    expect(screen.getByTestId('canvas-required-notice')).toBeInTheDocument()
    // Jump stays invokable — its lane comes from the fleet's own attachment.
    expect((screen.getByTestId('fleet-cmd-jump-fleet_1') as HTMLButtonElement).disabled).toBe(false)
  })

  // Scenario: A canvas-only control is disabled while the canvas is
  // unavailable
  it('Scenario: A canvas-only control is disabled while the canvas is unavailable', () => {
    panel({ canvasAvailable: false, selection: null })
    const burn = screen.getByTestId('burn-button')
    expect((burn as HTMLButtonElement).disabled).toBe(true)
  })

  it('SDET-added: with the canvas available the prompt DOES name the selection kinds', () => {
    panel({ canvasAvailable: true, selection: null })
    expect(screen.getByTestId('selection-prompt').textContent!.toLowerCase()).toMatch(
      /body|gate|point/,
    )
  })
})
