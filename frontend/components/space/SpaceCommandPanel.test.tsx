import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
// It commits through `useOrder` / `useJump`, per the component -> hook ->
// service layering. Since `lift-burn-preview-to-view` the quote arrives as
// props (`preview`, `currentQuote`, `previewStale`, `previewNoQuote`,
// `onRequote`) from the mounting view, which owns the one `useBurnPreview`
// call; the panel does not import the hook.
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
// openspec change `lift-burn-preview-to-view` (tasks.md 1.2): the panel no
// longer calls the preview hook — the mounting view lifts it and hands the
// quote down as props, so there is no hook mock and no mutable `previewState`
// here. `onRequote` is the hook's `retry` as the panel receives it.
const onRequote = vi.fn()

vi.mock('@/hooks/use-fleets', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/hooks/use-fleets')
  return { ...actual, useOrder: () => order, useJump: () => jump }
})

const toastError = vi.fn()
const toastSuccess = vi.fn()
const toastWarning = vi.fn()
vi.mock('@/lib/toast', () => ({
  toast: {
    error: (m: string) => toastError(m),
    success: (m: string) => toastSuccess(m),
    warning: (m: string) => toastWarning(m),
  },
}))

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
      preview={QUOTE}
      currentQuote={QUOTE}
      previewStale={false}
      previewNoQuote={false}
      onRequote={onRequote}
      {...over}
    />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  order.isPending = false
  jump.isPending = false
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
    const unaffordable = { ...QUOTE, affordable: false }
    panel({ preview: unaffordable, currentQuote: unaffordable })
    expect(screen.getByTestId('preview-affordable')).toHaveAttribute('data-affordable', 'false')
    // ...and visually distinct from the affordable state, not merely a
    // different attribute value.
    expect(screen.getByTestId('preview-panel').className).toMatch(/(rose|red|amber|warn)/i)
  })

  it('SDET-added: a stranding warning on the quote is surfaced', () => {
    const stranding = { ...QUOTE, strandingWarning: true }
    panel({ preview: stranding, currentQuote: stranding })
    expect(screen.getByTestId('preview-stranding')).toBeInTheDocument()
  })

  // Scenario: No displayed value is derived from a drawn position
  it('Scenario: No displayed value is derived from a drawn position', () => {
    // Every figure on this panel comes from the SERVED quote. Changing only
    // the served numbers must change every displayed number; if a figure
    // were recomputed from a drawn position it would not move.
    const served = { ...QUOTE, deltaV: 11.5, fuelCostTons: 2.3, arriveMs: T0 + 7 }
    const { container } = panel({ preview: served, currentQuote: served })
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
    panel({ preview: null, currentQuote: null, previewNoQuote: true })
    expect(screen.getByTestId('preview-no-quote')).toBeInTheDocument()
    expect(screen.queryByTestId('preview-arrival')).toBeNull()
    expect(screen.queryByTestId('preview-deltav')).toBeNull()
    expect(screen.queryByTestId('preview-fuel')).toBeNull()
  })

  // Scenario: A failed first preview offers a retry
  it('Scenario: A failed first preview offers a retry', async () => {
    panel({ preview: null, currentQuote: null, previewNoQuote: true })
    await userEvent.click(screen.getByTestId('preview-retry'))
    expect(onRequote).toHaveBeenCalled()
  })

  // Scenario: A failed refresh marks the shown figures stale
  it('Scenario: A failed refresh marks the shown figures stale', async () => {
    panel({ currentQuote: null, previewStale: true })
    expect(screen.getByTestId('preview-stale')).toBeInTheDocument()
    // The figures are still SHOWN — marked, not withdrawn.
    expect(screen.getByTestId('preview-deltav')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('preview-retry'))
    expect(onRequote).toHaveBeenCalled()
  })

  // Scenario: A later successful refresh clears the stale marking
  it('Scenario: A later successful refresh clears the stale marking', () => {
    // Asserted BOTH ways: the marking is gone AND the newest figures are
    // shown as current. Absence alone would pass against a panel that
    // rendered nothing at all.
    const stalePanel = (over: Record<string, unknown>) => (
      <SpaceCommandPanel
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fleet={FLEET as any}
        selection={{ bodyId: 'feat-body-3' }}
        canvasAvailable
        worldTime={T0}
        scale={1}
        preview={QUOTE}
        currentQuote={QUOTE}
        previewStale={false}
        previewNoQuote={false}
        onRequote={onRequote}
        {...over}
      />
    )
    const { rerender } = render(stalePanel({ currentQuote: null, previewStale: true }))
    expect(screen.getByTestId('preview-stale')).toBeInTheDocument()
    const fresh = { ...QUOTE, deltaV: 4444.4 }
    rerender(stalePanel({ preview: fresh, currentQuote: fresh, previewStale: false }))
    expect(screen.queryByTestId('preview-stale')).toBeNull()
    expect(screen.getByTestId('preview-deltav')).toHaveTextContent(/4444|4,444/)
  })

  // Scenario: The burn stays committable without a quote, labelled as
  // uncapped
  it('Scenario: The burn stays committable without a quote, labelled as uncapped', async () => {
    panel({ preview: null, currentQuote: null, previewNoQuote: true })
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
    panel({ currentQuote: null, previewStale: true })
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
    await waitFor(() => expect(onRequote).toHaveBeenCalled())
    // ...the new figures are presented for RE-CONFIRMATION...
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument()
    // ...and the order is NOT retried automatically at the higher cost.
    expect(order.mutate).toHaveBeenCalledTimes(1)
  })
})

describe('SpaceCommandPanel — the uncapped label and the lifted currentQuote (lift-burn-preview-to-view)', () => {
  // Scenario: The uncapped-burn label is never shown beside an unavailable
  // burn command (tasks.md 1.6; design decision 10). Each arm also supplies
  // no quote, so the label WOULD show under the pre-lift rule.
  it.each([
    ['no selection', { selection: null }],
    ['no acting fleet', { fleet: null }],
    ['an unavailable canvas', { canvasAvailable: false }],
    ['a running mine holding the movement channel', { mineRunning: true }],
  ])(
    'Scenario: The uncapped-burn label is never shown beside an unavailable burn command — %s',
    (_name, over) => {
      panel({ preview: null, currentQuote: null, previewNoQuote: false, ...over })
      expect((screen.getByTestId('burn-button') as HTMLButtonElement).disabled).toBe(true)
      expect(screen.queryByTestId('burn-uncapped-label')).toBeNull()
    },
  )

  // Scenario: The burn stays committable without a quote, labelled as uncapped
  // (tasks.md 1.6, the available arms; the withheld/loading shape is the one
  // the lift newly produces: no preview, no failure).
  it.each([
    ['the withheld or loading shape (no preview, no failure)', { preview: null, currentQuote: null, previewNoQuote: false }],
    ['a failed first quote', { preview: null, currentQuote: null, previewNoQuote: true }],
    ['a stale quote', { currentQuote: null, previewStale: true }],
  ])(
    'Scenario: The burn stays committable without a quote, labelled as uncapped — available Burn with %s shows the label',
    (_name, over) => {
      panel(over)
      expect((screen.getByTestId('burn-button') as HTMLButtonElement).disabled).toBe(false)
      expect(screen.getByTestId('burn-uncapped-label')).toBeInTheDocument()
    },
  )

  it('SDET-added: with a current quote the uncapped label is absent and the burn is available', () => {
    panel()
    expect((screen.getByTestId('burn-button') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByTestId('burn-uncapped-label')).toBeNull()
  })

  // tasks.md 1.7, design decision 2: the panel does not derive currency
  // itself. `preview` is supplied and NOT stale, but the view handed no
  // `currentQuote`: the panel must trust that, not re-derive `preview && !stale`.
  it('Scenario: A stale figure never becomes a cap — the panel does not derive currency itself (preview supplied, currentQuote null, previewStale false)', async () => {
    panel({ preview: QUOTE, currentQuote: null, previewStale: false })
    // the figures the view handed down are shown ...
    expect(screen.getByTestId('preview-deltav')).toBeInTheDocument()
    // ... but with no current quote there is no ceiling, the label shows ...
    expect(screen.queryByTestId('preview-fuel-ceiling')).toBeNull()
    expect(screen.getByTestId('burn-uncapped-label')).toBeInTheDocument()
    // ... and the order carries no cap.
    await userEvent.click(screen.getByTestId('burn-button'))
    const body = order.mutate.mock.calls[0][0].request ?? order.mutate.mock.calls[0][0]
    expect(Object.prototype.hasOwnProperty.call(body, 'maxFuelTons')).toBe(false)
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
    order.mutate.mockImplementation((_v: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.({
        ...FLEET,
        state: { Mode: 0, Park: null, Drift: null, Burn: { ArriveMs: T0 + 12_345, DeltaV: 88.5, DepartMs: T0, Curve: [] } },
      })
    })
    panel({ preview: null, currentQuote: null, previewNoQuote: true })
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

// ===========================================================================
// openspec change `surface-commit-stranding-warning` (tasks.md 1.1-1.5; impl
// contract §5) — the panel's commit report, its advisory toast and its static
// notice. Red until task 4.1. The new props are passed through the `panel()`
// spread and a spread element for re-renders, so `tsc` is clean before 4.1.
// The copy is asserted as LITERAL strings, never an imported constant.
// ===========================================================================

const NOTICE_COPY =
  'Your current course leaves this fleet unable to reach any station or lane gate. Place a different order to change it.'
const TOAST_COPY = 'This course leaves the fleet unable to reach a station or lane gate.'

const CAP_REJECTION = Object.assign(new Error('rejected'), {
  data: { error: 'fleet: solved fuel cost exceeds the requested maxFuelTons cap' },
})

function acceptedFleet(over: Record<string, unknown> = {}) {
  return {
    ...FLEET,
    state: {
      Mode: 0,
      Park: null,
      Drift: null,
      Burn: { ...QUOTE, DepartMs: T0 + 1000, ArriveMs: T0 + 61000, DeltaV: QUOTE.deltaV },
    },
    ...over,
  }
}

type Held = { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void }

function holdResponse(): { get: () => Held } {
  let held: Held = {}
  order.mutate.mockImplementation((_v: unknown, opts?: Held) => {
    held = opts ?? {}
  })
  return { get: () => held }
}

const panelElement = (over: Record<string, unknown>) => (
  <SpaceCommandPanel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fleet={FLEET as any}
    selection={{ bodyId: 'feat-body-3' }}
    canvasAvailable
    worldTime={T0}
    scale={1}
    preview={QUOTE}
    currentQuote={QUOTE}
    previewStale={false}
    previewNoQuote={false}
    onRequote={onRequote}
    {...over}
  />
)

describe('SpaceCommandPanel — the commit report (surface-commit-stranding-warning 1.1)', () => {
  // 1.1
  it('Scenario: A response that lands after the acting fleet changed belongs to the fleet that committed — the callback carries the fleet the command was invoked for, the instants and the warning', async () => {
    const onCommitAccepted = vi.fn()
    const held = holdResponse()
    const { rerender } = render(panelElement({ onCommitAccepted }))
    await userEvent.click(screen.getByTestId('burn-button'))
    expect(order.mutate, 'GIVEN: the command was invoked once').toHaveBeenCalledTimes(1)
    expect(order.mutate.mock.calls[0][0].fleetId, 'GIVEN: invoked for fleet_1').toBe('fleet_1')

    rerender(panelElement({ onCommitAccepted, fleet: { ...FLEET, id: 'fleet_2' } }))
    expect(onCommitAccepted, 'GIVEN: nothing is reported before the response lands').not.toHaveBeenCalled()

    act(() => held.get().onSuccess?.(acceptedFleet({ strandingWarning: true })))

    expect(onCommitAccepted).toHaveBeenCalledTimes(1)
    expect(onCommitAccepted).toHaveBeenCalledWith({
      fleetId: 'fleet_1',
      departMs: T0 + 1000,
      arriveMs: T0 + 61000,
      strandingWarning: true,
      selectionKey: 'body:feat-body-3',
    })
  })
})

describe('SpaceCommandPanel — an unwarned commit (surface-commit-stranding-warning 1.2)', () => {
  // 1.2
  it.each([
    ['the stranding field absent', {}],
    ['the stranding field false', { strandingWarning: false }],
  ] as const)(
    'Scenario: A response without the stranding field shows no notice — %s reports no warning, fires no warning toast, one success toast',
    async (_arm, extra) => {
      const onCommitAccepted = vi.fn()
      const held = holdResponse()
      render(panelElement({ onCommitAccepted }))
      await userEvent.click(screen.getByTestId('burn-button'))
      act(() => held.get().onSuccess?.(acceptedFleet(extra)))

      expect(onCommitAccepted).toHaveBeenCalledTimes(1)
      expect(onCommitAccepted).toHaveBeenCalledWith({
        fleetId: 'fleet_1',
        departMs: T0 + 1000,
        arriveMs: T0 + 61000,
        strandingWarning: false,
        selectionKey: 'body:feat-body-3',
      })
      expect(toastWarning).not.toHaveBeenCalled()
      expect(toastSuccess).toHaveBeenCalledTimes(1)
      expect(toastError).not.toHaveBeenCalled()
    },
  )
})

describe('SpaceCommandPanel — a rejected or failed commit reports nothing (surface-commit-stranding-warning 1.3)', () => {
  // 1.3 — the control leg (a successful commit DOES call the callback) is what
  // makes the "not called after the rejection" half non-vacuous.
  it.each([
    ['a cap rejection', CAP_REJECTION],
    ['a failure with no mapped reason', new Error('API Error: 500 Internal Server Error')],
  ] as const)(
    'Scenario: A rejected or failed commit shows no notice and leaves an earlier one alone — %s does not call the callback',
    async (_arm, failure) => {
      const onCommitAccepted = vi.fn()
      const held = holdResponse()
      render(panelElement({ onCommitAccepted }))

      await userEvent.click(screen.getByTestId('burn-button'))
      act(() => held.get().onSuccess?.(acceptedFleet({ strandingWarning: true })))
      expect(onCommitAccepted, 'CONTROL: an accepted commit calls the callback once').toHaveBeenCalledTimes(1)
      expect(toastWarning).toHaveBeenCalledTimes(1)
      toastError.mockClear()

      await userEvent.click(screen.getByTestId('burn-button'))
      expect(order.mutate, 'GIVEN: a second command was invoked').toHaveBeenCalledTimes(2)
      act(() => held.get().onError?.(failure))

      expect(onCommitAccepted, 'the rejection reports nothing').toHaveBeenCalledTimes(1)
      expect(toastError, 'the existing error copy is unchanged: one error toast').toHaveBeenCalledTimes(1)
      const shown = String(toastError.mock.calls[0][0])
      expect(shown).not.toMatch(/API Error|500|Internal Server|^fleet:/)
      expect(toastWarning, 'no second advisory toast').toHaveBeenCalledTimes(1)
    },
  )
})

describe('SpaceCommandPanel — the notice element (surface-commit-stranding-warning 1.4)', () => {
  // 1.4
  it.each([
    ['the default preview props', {}],
    ['no preview and no quote', { preview: null, currentQuote: null }],
  ] as const)(
    'Scenario: The notice is advisory and distinct from the preview\'s stranding line — commitStrandingNotice true with %s renders a static line below Burn',
    (_arm, over) => {
      panel({ commitStrandingNotice: true, ...over })
      const notice = screen.getByTestId('commit-stranding-notice')
      expect(notice).toBeInTheDocument()
      expect(notice.textContent).toBe(NOTICE_COPY)
      const burnBtn = screen.getByTestId('burn-button')
      expect(
        burnBtn.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the Burn control precedes the notice',
      ).toBeTruthy()
      expect(notice.hasAttribute('role'), 'no alert/status role of its own').toBe(false)
      expect(notice.closest('[aria-live],[role="alert"],[role="status"]'), 'outside any live region').toBeNull()
      expect(notice.querySelector('button'), 'no dismiss control').toBeNull()
      expect(notice.className, 'no error treatment').not.toMatch(/red|rose/)
      expect(screen.getByTestId('burn-button'), 'the Burn control is still present').toBeInTheDocument()
    },
  )

  it('Scenario: The notice is advisory and distinct from the preview\'s stranding line — false and omitted render nothing, while true renders it', () => {
    const { rerender } = render(panelElement({ commitStrandingNotice: true }))
    expect(screen.queryByTestId('commit-stranding-notice'), 'GIVEN: true renders it').not.toBeNull()
    rerender(panelElement({ commitStrandingNotice: false }))
    expect(screen.queryByTestId('commit-stranding-notice'), 'false renders nothing').toBeNull()
    rerender(panelElement({ commitStrandingNotice: true }))
    expect(screen.queryByTestId('commit-stranding-notice'), 'GIVEN again: true renders it').not.toBeNull()
    rerender(panelElement({}))
    expect(screen.queryByTestId('commit-stranding-notice'), 'omitted renders nothing').toBeNull()
  })

  // Revision (ruling 16, QA Matrix B clause "SHALL NOT remove, disable or
  // re-order the burn control"): the burn control's disabled state is the same
  // with and without the notice, in both an available and an unavailable arm.
  it.each([
    ['available (a body selected)', { selection: { bodyId: 'feat-body-3' } }, false],
    ['unavailable (nothing selected)', { selection: null }, true],
  ] as const)(
    'Scenario: The notice is advisory and distinct from the preview\'s stranding line — the notice does not change the burn control\'s disabled state, %s',
    (_arm, over, expectedDisabled) => {
      const burnDisabled = () => (screen.getByTestId('burn-button') as HTMLButtonElement).disabled
      const { rerender } = render(panelElement({ ...over }))
      expect(burnDisabled(), 'GIVEN: the control state without the notice').toBe(expectedDisabled)
      rerender(panelElement({ ...over, commitStrandingNotice: true }))
      expect(screen.queryByTestId('commit-stranding-notice'), 'GIVEN: the notice is shown').not.toBeNull()
      expect(burnDisabled(), 'the notice neither disables nor enables the control').toBe(expectedDisabled)
      rerender(panelElement({ ...over, commitStrandingNotice: false }))
      expect(burnDisabled(), 'removal leaves the state unchanged').toBe(expectedDisabled)
    },
  )

  it('SDET-added: the notice is a separate element from the preview stranding line when both show', () => {
    const stranding = { ...QUOTE, strandingWarning: true }
    panel({ preview: stranding, currentQuote: stranding, commitStrandingNotice: true })
    const line = screen.getByTestId('preview-stranding')
    const notice = screen.getByTestId('commit-stranding-notice')
    expect(line).not.toBe(notice)
    expect(line.contains(notice)).toBe(false)
    expect(notice.contains(line)).toBe(false)
  })
})

describe('SpaceCommandPanel — the advisory toast (surface-commit-stranding-warning 1.5)', () => {
  // 1.5
  it.each([
    ['the panel still holding fleet_1', 'fleet_1'],
    ['the panel re-rendered with fleet_2 before the response', 'fleet_2'],
  ] as const)(
    'Scenario: The warning is conveyed once, at the acceptance — a warned response with %s fires one warning toast, no error toast, one success toast',
    async (_arm, holding) => {
      const held = holdResponse()
      const { rerender } = render(panelElement({}))
      await userEvent.click(screen.getByTestId('burn-button'))
      if (holding === 'fleet_2') rerender(panelElement({ fleet: { ...FLEET, id: 'fleet_2' } }))
      expect(toastWarning, 'GIVEN: no warning before the response').not.toHaveBeenCalled()

      act(() => held.get().onSuccess?.(acceptedFleet({ strandingWarning: true })))

      expect(toastWarning).toHaveBeenCalledTimes(1)
      expect(toastWarning).toHaveBeenCalledWith(TOAST_COPY)
      expect(toastError).not.toHaveBeenCalled()
      // Scenario: The success feedback is not suppressed by the notice
      expect(toastSuccess).toHaveBeenCalledTimes(1)
      expect(String(toastSuccess.mock.calls[0][0])).toContain('in 1m')
      const warned = String(toastWarning.mock.calls[0][0])
      expect(warned).toMatch(/station/i)
      expect(warned).toMatch(/lane gate/i)
      expect(warned).not.toMatch(/\d/)
      expect(warned).not.toMatch(/strand/i)
    },
  )
})


// ===========================================================================
// openspec change `clear-burn-preview-on-commit` (tasks.md 2.1-2.3; impl
// contract §6) — the committed statement, the disabled Burn control and the
// click-time selection key in the accepted-commit payload. Red until 5.1/5.2.
// The new props go through the `Record<string, unknown>` spread, so this file
// type-checks before the build. The copy is a LOCAL literal, never imported.
// ===========================================================================

const STATEMENT_COPY =
  'A burn order is committed to this target, so Burn is unavailable for it. Select another target to change course.'
const statementEl = () => screen.queryByTestId('selection-committed-statement')
const burnEl = () => screen.getByTestId('burn-button') as HTMLButtonElement

describe('Scenario: A committed order removes the quote and withholds the burn command — the panel arm (2.1 a)', () => {
  it('Scenario: A committed order removes the quote and withholds the burn command — selectionCommitted true, false and omitted', async () => {
    const noQuote = { preview: null, currentQuote: null }
    const { rerender } = render(panelElement({ ...noQuote, selectionCommitted: true }))

    const assertCommitted = async (leg: string) => {
      const stmt = statementEl()
      expect(stmt, `${leg}: the statement is present`).not.toBeNull()
      expect(burnEl().disabled, `${leg}: the control is natively disabled`).toBe(true)
      order.mutate.mockClear()
      await userEvent.click(burnEl())
      expect(order.mutate, `${leg}: activating the control sends no order`).not.toHaveBeenCalled()
      expect(screen.queryByTestId('burn-uncapped-label'), `${leg}: no uncapped label`).toBeNull()
      const described = burnEl().getAttribute('aria-describedby')
      expect(described, `${leg}: the control is described`).toBeTruthy()
      expect(described).toBe(stmt!.id)
      expect(stmt!.id).not.toBe('')
      expect(document.getElementById(described!), `${leg}: the description is the statement`).toBe(stmt)
    }
    const assertAvailable = (leg: string) => {
      expect(statementEl(), `${leg}: no statement`).toBeNull()
      expect(burnEl().disabled, `${leg}: the control is enabled`).toBe(false)
      expect(screen.queryByTestId('burn-uncapped-label'), `${leg}: the label is shown`).not.toBeNull()
      expect(burnEl().hasAttribute('aria-describedby'), `${leg}: no description`).toBe(false)
    }

    await assertCommitted('true')
    rerender(panelElement({ ...noQuote, selectionCommitted: false }))
    assertAvailable('false')
    rerender(panelElement({ ...noQuote }))
    assertAvailable('omitted')
    rerender(panelElement({ ...noQuote, selectionCommitted: true }))
    await assertCommitted('true again')
  })

  // 2.1 b
  it('Scenario: A committed order removes the quote and withholds the burn command — with the canvas unavailable the statement is still shown and the label absent', () => {
    panel({ selectionCommitted: true, canvasAvailable: false, preview: null, currentQuote: null })
    expect(screen.queryByTestId('canvas-required-notice')).not.toBeNull()
    const stmt = statementEl()
    expect(stmt).not.toBeNull()
    expect(screen.queryByTestId('burn-uncapped-label')).toBeNull()
    expect(burnEl().getAttribute('aria-describedby')).toBe(stmt!.id)
    expect(stmt!.id).not.toBe('')
  })
})

describe('Scenario: A response that lands after the selection was replaced withholds nothing for the new selection — the click-time key (2.2)', () => {
  it.each([
    ['a body', { bodyId: 'feat-body-3' }, 'body:feat-body-3'],
    ['a point', { point: { x: 30, y: 0, z: -10 } }, 'point:30,0,-10'],
  ] as const)(
    'Scenario: A response that lands after the selection was replaced withholds nothing for the new selection — the payload carries the selection the command was invoked for, %s',
    async (_arm, invoked, key) => {
      const onCommitAccepted = vi.fn()
      const held = holdResponse()
      const { rerender } = render(panelElement({ onCommitAccepted, selection: invoked }))
      await userEvent.click(screen.getByTestId('burn-button'))
      expect(order.mutate, 'GIVEN: the command was invoked once').toHaveBeenCalledTimes(1)

      rerender(panelElement({ onCommitAccepted, selection: { bodyId: 'feat-body-9' } }))
      expect(onCommitAccepted, 'GIVEN: nothing is reported before the response lands').not.toHaveBeenCalled()
      act(() => held.get().onSuccess?.(acceptedFleet({})))

      expect(onCommitAccepted).toHaveBeenCalledTimes(1)
      expect(onCommitAccepted).toHaveBeenCalledWith({
        fleetId: 'fleet_1',
        departMs: T0 + 1000,
        arriveMs: T0 + 61000,
        strandingWarning: false,
        selectionKey: key,
      })
    },
  )
})

describe('Scenario: The statement carries no figure and no wire text — the panel arm (2.3)', () => {
  const live = '[aria-live],[role="alert"],[role="status"],[role="log"],[role="timer"],[role="marquee"]'

  // 2.3 a
  it.each([
    ['a body', { selection: { bodyId: 'feat-body-3' } }],
    ['a lane gate (a body with matching gateFacts)', { selection: { bodyId: 'feat-body-3' }, gateFacts: { bodyId: 'feat-body-3', destSystemId: 'sys_4_4' } }],
    ['a point', { selection: { point: { x: 30, y: 0, z: -10 } } }],
  ] as const)(
    'Scenario: The statement carries no figure and no wire text — the static copy, placed between the selection line and Burn, outside any live region, for %s',
    (_arm, over) => {
      panel({ ...over, selectionCommitted: true })
      const stmt = statementEl()
      expect(stmt, 'the statement is shown').not.toBeNull()
      expect(stmt!.textContent).toBe(STATEMENT_COPY)
      expect(stmt!.textContent).not.toMatch(/\d/)
      expect(stmt!.textContent).toMatch(/burn is unavailable/i)
      expect(stmt!.textContent).toMatch(/select another target/i)
      expect(stmt!.textContent).not.toContain('feat-body-3')
      const facts = screen.getByTestId('selection-facts')
      expect(
        facts.compareDocumentPosition(stmt as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
        'the selection line precedes it',
      ).toBeTruthy()
      expect(
        stmt!.compareDocumentPosition(burnEl()) & Node.DOCUMENT_POSITION_FOLLOWING,
        'it precedes the burn control',
      ).toBeTruthy()
      expect(stmt!.hasAttribute('role'), 'no role').toBe(false)
      expect(stmt!.hasAttribute('aria-live'), 'no aria-live').toBe(false)
      expect(stmt!.closest(live), 'outside any live region').toBeNull()
      expect(stmt!.querySelector('button'), 'no control inside it').toBeNull()
    },
  )

  // 2.3 b
  it('Scenario: The statement carries no figure and no wire text — identical across two different responses and fleets', async () => {
    const textAfter = async (fleet: Record<string, unknown>, response: Record<string, unknown>) => {
      const held = holdResponse()
      const { rerender, unmount } = render(panelElement({ fleet }))
      await userEvent.click(screen.getByTestId('burn-button'))
      act(() => held.get().onSuccess?.(response))
      rerender(panelElement({ fleet, selectionCommitted: true }))
      const text = statementEl()?.textContent
      unmount()
      return text
    }
    const first = await textAfter(FLEET, acceptedFleet({}))
    const second = await textAfter(
      { ...FLEET, id: 'fleet_7', state: acceptedFleet({}).state },
      acceptedFleet({ id: 'fleet_7', strandingWarning: true, state: { Mode: 0, Park: null, Drift: null, Burn: { ...QUOTE, DepartMs: T0 + 5000, ArriveMs: T0 + 80000, DeltaV: 12 } } }),
    )
    expect(first).toBe(STATEMENT_COPY)
    expect(second).toBe(first)
  })

  // 2.3 c
  it('Scenario: The statement carries no figure and no wire text — it precedes the stranding and drift notices when all show', async () => {
    const held = holdResponse()
    const { rerender } = render(panelElement({}))
    await userEvent.click(screen.getByTestId('burn-button'))
    act(() => held.get().onSuccess?.(acceptedFleet({ strandingWarning: true })))
    rerender(panelElement({ selectionCommitted: true, commitStrandingNotice: true }))

    const stranding = screen.queryByTestId('commit-stranding-notice')
    const drift = screen.queryByTestId('commit-drift-notice')
    expect(stranding, 'GIVEN: the stranding notice shows').not.toBeNull()
    expect(drift, 'GIVEN: the drift notice shows').not.toBeNull()
    const stmt = statementEl()
    expect(stmt, 'the statement shows').not.toBeNull()
    for (const el of [stranding, drift]) {
      expect(stmt!.compareDocumentPosition(el as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })
})
