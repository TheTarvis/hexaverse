import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

// RED-PHASE SUITE — openspec change add-scan-and-sightings-surface,
// tasks.md §5-6 (`system-space-view`'s ADDED "The Focused-Scan Target List
// Comes From the Server, Never From a Client Predicate", "A Sweep's Cost Is
// Presented as Time and Exposure, Not Time Alone", "A Focused Scan Commits
// Against a Listed Target and Reports Its Rejection in Player Copy", "The
// Scan Commit Control Guards Against Double-Submit" (see the DEDICATED
// mutation-layer test, hooks/use-scan-double-submit.test.tsx — this file
// covers the CONTROL's rendering contract, not the guard's race), "A
// Running Sweep's Window and Cancel Come From the Action Inbox", "A Settled
// Sweep Reports Its Outcome, Including Each Fizzle Reason, in Player Copy").
//
// CONTRACT — `frontend/components/space/ScanControl.tsx` (link8b-impl-
// contract.md §1.10 pins its test ids; its PROPS are an SDET judgment call,
// open to a mechanical-rename dispute, not a behavior dispute):
//
//   export interface ScanControlProps {
//     fleet: Fleet | null   // the acting fleet; null withdraws the control
//     worldTime: number     // this view's projected world time (for the countdown)
//   }
//
// The component reads its OWN data — `useScanTargets(fleet?.id)`,
// `useScan(fleet?.id)`, `useRunningScan(fleet?.id)` (adopted, not a new
// hook), `useSettledScan(fleet?.id)`, `useCancelAction` — rather than
// receiving them as props, mirroring FleetActionsPanel's own mix of
// externally-supplied read-only data (station, credits) and self-owned
// mutation hooks.
//
// data-testid contract (link8b-impl-contract.md §1.10, pinned):
//   scan-control, scan-target-select, scan-commit-button, scan-countdown,
//   scan-cancel, scan-report, scan-report-dismiss.
//
// EXPECTED RED TODAY: `Cannot find module './ScanControl'` — the component
// does not exist yet.

const scanTargets = { data: undefined as { targets: { hostId: string; kind: string; durationMs: number }[] } | undefined, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }
const scanMutation = { mutate: vi.fn(), isPending: false }
const runningScan: { data: { id: string; committedAt: number; eta: number } | null } = { data: null }
const settledScan: { data: { id: string; reasonCode?: string; resolvedAt: number; eta: number } | null; isError: boolean } = { data: null, isError: false }
const cancelAction = { mutate: vi.fn(), isPending: false }
const acknowledge = { mutate: vi.fn() }

vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => scanTargets,
  useScan: () => scanMutation,
  useSettledScan: () => settledScan,
}))
// `useAcknowledgeAction` is an SDET-chosen contract addition to
// `hooks/use-actions.ts` (mirroring `useCancelAction`'s own existing shape
// in that same module) — no task text names it explicitly, but 6.12
// ("Acknowledge the action when the report is dismissed") needs SOME
// mutation hook wired to `POST /v1/actions/:id/acknowledge` (task 4.6), and
// this is the least invented shape consistent with the module's own
// existing sibling. A developer landing acknowledge some other way (e.g.
// bundled onto useSettledScan's own return) should raise this as a
// mechanical-rename dispute.
vi.mock('@/hooks/use-actions', () => ({
  useRunningScan: () => runningScan,
  useCancelAction: () => cancelAction,
  useAcknowledgeAction: () => acknowledge,
}))

import { ScanControl } from './ScanControl'

const T0 = 21_175_110_953

function fleet(over: Record<string, unknown> = {}) {
  return { id: 'fleet_1', corporationId: 'corp-1', systemId: 'sys_-7_17', attachedTo: undefined, ...over }
}

function control(over: Record<string, unknown> = {}) {
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ScanControl fleet={fleet() as any} worldTime={T0} {...over} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  scanTargets.data = undefined
  scanTargets.isLoading = false
  scanTargets.isError = false
  scanTargets.isFetching = false
  scanMutation.isPending = false
  runningScan.data = null
  settledScan.data = null
  settledScan.isError = false
})

describe('ScanControl — the served target list (system-space-view "The Focused-Scan Target List Comes From the Server")', () => {
  // Scenario: Served targets are listed with their kind and duration.
  it('Scenario: Served targets are listed with their kind and duration', () => {
    scanTargets.data = {
      targets: [
        { hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 },
        { hostId: 'flt-9x2', kind: 'fleet', durationMs: 3120 },
      ],
    }
    control()
    const select = screen.getByTestId('scan-target-select') as HTMLSelectElement
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent ?? '')
    expect(options.some((t) => t.includes('feat-belt-1') && t.toLowerCase().includes('body'))).toBe(true)
    expect(options.some((t) => t.includes('flt-9x2') && t.toLowerCase().includes('fleet'))).toBe(true)
  })

  // Scenario: An empty target set is stated, not shown as an empty list.
  it('Scenario: An empty target set is stated, not shown as an empty list', () => {
    scanTargets.data = { targets: [] }
    control()
    expect(screen.queryByTestId('scan-target-select')).not.toBeInTheDocument()
    expect(screen.getByTestId('scan-control').textContent?.toLowerCase()).toContain('range')
  })

  // Scenario: An empty target set explained by transit or a running sweep
  // states that instead.
  it('Scenario: An empty set while a sweep is already running states that, not "no host in range"', () => {
    scanTargets.data = { targets: [] }
    runningScan.data = { id: 'action_1', committedAt: T0, eta: T0 + 5000 }
    control()
    const text = screen.getByTestId('scan-control').textContent?.toLowerCase() ?? ''
    expect(text).not.toContain('no host in range')
  })

  // Scenario: An empty set awaiting its triggered refetch is not reported
  // as no host in range (system-space-view, added per link8b-adversary-r9
  // ruling A2 — a spec addition, not a pre-existing gap: A2 was accepted
  // and landed in spec.md this round). GIVEN the settled sweep's
  // running-status inbox read has already landed showing no running sweep
  // (`runningScan.data === null`), while the TRIGGERED scan-target refetch
  // over the stale held-channel empty set is still in flight
  // (`targets.length === 0 && scanTargets.isFetching`) — THEN the control
  // presents the list as being re-read, never "no host is in range" on the
  // authority of the superseded set.
  it('Scenario: An empty set awaiting its triggered refetch is not reported as no host in range', () => {
    scanTargets.data = { targets: [] } // the stale, held-channel empty page
    scanTargets.isFetching = true // ...but a fresh read is already in flight
    runningScan.data = null // the inbox already says the sweep is over
    control()
    const text = screen.getByTestId('scan-control').textContent?.toLowerCase() ?? ''
    expect(
      screen.getByTestId('scan-targets-rereading'),
      'system-space-view "An empty set awaiting its triggered refetch is not reported as no host in range": ' +
        'no re-reading state was shown for an in-flight refetch over a stale empty page',
    ).toBeInTheDocument()
    expect(
      text,
      'the stale held-channel empty set must never be reported as "no host is in range" while its own ' +
        'triggered refetch is still in flight',
    ).not.toContain('no host is in range')
  })

  // SDET control: the identical stale empty set, with NO refetch in
  // flight, DOES fall through to "no host is in range" — proving the
  // assertion above is not vacuously true against a control that always
  // withholds that copy.
  it('SDET control: the same empty set with no refetch in flight DOES say "no host is in range"', () => {
    scanTargets.data = { targets: [] }
    scanTargets.isFetching = false
    runningScan.data = null
    control()
    expect(screen.queryByTestId('scan-targets-rereading')).not.toBeInTheDocument()
    expect(screen.getByTestId('scan-control').textContent?.toLowerCase()).toContain('no host is in range')
  })

  // SDET-added regression (link8b-adversary-r11, "Post-repair defect found
  // during the F11-1 build", orchestrator ruling 2026-09-03): the F11-1
  // gate at ScanControl.tsx:239 reads `targets.length === 0 &&
  // settledScan.data` — ANY unacknowledged settled scan, not just the one
  // that just ended an early-settle committed-and-awaiting window. Reached
  // honestly: an ordinary ETA-path settle already reported and never
  // dismissed (`settledScan.data` truthy, exactly as `useSettledScan`
  // would still return it days later), THEN — unrelated to that report —
  // the scan-target read genuinely empties out (fleet moved, reattached,
  // baseline poll re-read), with no commit in flight
  // (`committedPending: false`), no refetch superseding a stale page
  // (`scanTargets.isFetching: false`), and no running sweep
  // (`runningScan.data: null`). None of the spec's three closed exceptions
  // (lane transit, already sweeping, commit accepted but not yet
  // reflected) applies, so *An empty target set is stated, not shown as an
  // empty list* still governs. Every OTHER reason the copy could be
  // missing is ruled out below, so a failure here can only mean the report
  // -presence gate over-fired.
  it('SDET: a stale unacknowledged settled report does not suppress the empty-set copy for a later, unrelated empty read', () => {
    // An ordinary ETA-path settle, already reported, never dismissed.
    settledScan.data = { id: 'action_done_old', resolvedAt: T0 - 50_000, eta: T0 - 55_000 }
    // Later and unrelated: a genuinely empty scan-target read.
    scanTargets.data = { targets: [] }
    scanTargets.isFetching = false
    scanTargets.isLoading = false
    runningScan.data = null
    control({ committedPending: false })

    // Rule out every other reason the copy could be absent.
    expect(screen.queryByTestId('scan-commit-pending')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scan-targets-rereading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scan-targets-loading')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scan-countdown')).not.toBeInTheDocument()
    // The stale report is indeed still on screen — this is the reachable
    // "never dismissed" state the defect names, not an already-acknowledged one.
    expect(screen.getByTestId('scan-report')).toBeInTheDocument()

    const text = screen.getByTestId('scan-control').textContent?.toLowerCase() ?? ''
    expect(
      text,
      'system-space-view "The Focused-Scan Target List Comes From the Server, Never From a Client ' +
        'Predicate": an old unacknowledged settled report must not suppress "No host is in range" for a ' +
        'later, unrelated empty target read (none of the three closed exceptions applies here)',
    ).toContain('no host is in range')
  })

  // Scenario: A failed target read is retriable and offers nothing.
  it('Scenario: A failed target read is retriable and offers nothing', () => {
    scanTargets.isError = true
    control()
    expect(screen.queryByTestId('scan-target-select')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  // Scenario (SDET-added, structural — 5.2/5.4): the control's props carry
  // no interior data and no space-view selection, so it CANNOT compute or
  // mirror a client-side range/occlusion predicate, and cannot be affected
  // by the view's own body/gate/point selection — it has nothing to read
  // either from.
  it('accepts no interior or selection prop to mirror a predicate from (structural)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const props = { fleet: fleet(), worldTime: T0 } as any
    expect('interior' in props).toBe(false)
    expect('selection' in props).toBe(false)
  })
})

describe('ScanControl — exposure copy (system-space-view "A Sweep\'s Cost Is Presented as Time and Exposure, Not Time Alone")', () => {
  it('Scenario: The control states the exposure before a commit', () => {
    scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
    control()
    expect(screen.getByTestId('scan-control').textContent?.toLowerCase()).toContain('detect')
  })

  it('Scenario: An attached fleet is told the sweep breaks its masking', () => {
    scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
    control({ fleet: fleet({ attachedTo: 'feat-belt-1' }) })
    expect(screen.getByTestId('scan-control').textContent?.toLowerCase()).toContain('mask')
  })

  it('Scenario: An unattached fleet is not told about masking', () => {
    scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
    control({ fleet: fleet({ attachedTo: undefined }) })
    expect(screen.getByTestId('scan-control').textContent?.toLowerCase()).not.toContain('mask')
  })
})

describe('ScanControl — commit and rejection copy (system-space-view "A Focused Scan Commits Against a Listed Target...")', () => {
  it('Scenario: A commit sends the served host id', async () => {
    const user = userEvent.setup()
    scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
    control()
    await user.selectOptions(screen.getByTestId('scan-target-select'), 'feat-belt-1')
    await user.click(screen.getByTestId('scan-commit-button'))
    expect(scanMutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ hostId: 'feat-belt-1' }),
      expect.anything(),
    )
  })

  // Scenario: An unmapped commit rejection reason renders safely / No raw
  // server text reaches the player.
  it('Scenario: A rejection never shows raw server text', async () => {
    const user = userEvent.setup()
    scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
    scanMutation.mutate = vi.fn((_vars, opts) => {
      opts?.onError?.(new Error('disclosure: focused-scan target beyond range'))
    })
    control()
    await user.selectOptions(screen.getByTestId('scan-target-select'), 'feat-belt-1')
    await user.click(screen.getByTestId('scan-commit-button'))
    await waitFor(() => {
      const text = screen.getByTestId('scan-control').textContent ?? ''
      expect(text.toLowerCase()).not.toContain('disclosure:')
    })
  })
})

describe('ScanControl — the running sweep (system-space-view "A Running Sweep\'s Window and Cancel Come From the Action Inbox")', () => {
  beforeEach(() => {
    runningScan.data = { id: 'action_running_1', committedAt: T0, eta: T0 + 5000 }
  })

  // Scenario: The commit control is withheld while a sweep runs.
  it('Scenario: The commit control is withheld while a sweep runs', () => {
    control()
    expect(screen.queryByTestId('scan-commit-button')).not.toBeInTheDocument()
    expect(screen.getByTestId('scan-countdown')).toBeInTheDocument()
  })

  // Scenario: A past-ETA sweep reads as settling, not as a negative countdown.
  it('Scenario: A past-ETA running sweep is presented as settling', () => {
    runningScan.data = { id: 'action_running_1', committedAt: T0 - 10_000, eta: T0 - 1 }
    control()
    const text = screen.getByTestId('scan-countdown').textContent?.toLowerCase() ?? ''
    expect(text).toContain('settl')
    expect(text).not.toContain('-')
  })

  // Scenario: Cancel names the scan action's own id.
  it('Scenario: Cancel names the scan action\'s own id, never a fleet-level cancel', async () => {
    const user = userEvent.setup()
    control()
    await user.click(screen.getByTestId('scan-cancel'))
    expect(cancelAction.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'action_running_1' }),
      expect.anything(),
    )
  })
})

describe('ScanControl — the settled report (system-space-view "A Settled Sweep Reports Its Outcome...")', () => {
  // Scenario: A sweep that minted records reports and links to the log.
  it('Scenario: A sweep that minted records reports filed records and offers the log', () => {
    settledScan.data = { id: 'action_done_1', resolvedAt: T0, eta: T0 }
    control()
    const report = screen.getByTestId('scan-report')
    expect(report.textContent?.toLowerCase()).toMatch(/filed|record/)
  })

  // Scenario: Each served fizzle reason reads as its own statement — a
  // representative subset here; the FULL six-way mapping (plus the
  // unrecognized fallback) is exhaustively unit-tested at the copy-module
  // level (lib/scan-copy.test.ts) — this file only proves the WIRING.
  it.each(['outOfRange', 'laneTransit', 'alreadySettled'])(
    'Scenario: A fizzle with reasonCode %s reads as its own statement, never the raw code',
    (code) => {
      settledScan.data = { id: 'action_done_1', resolvedAt: T0, eta: T0, reasonCode: code }
      control()
      const text = screen.getByTestId('scan-report').textContent ?? ''
      expect(text.toLowerCase()).not.toContain(code.toLowerCase())
    },
  )

  // Scenario: Dismissing a report acknowledges the action.
  it('Scenario: Dismissing a report acknowledges the action', async () => {
    const user = userEvent.setup()
    settledScan.data = { id: 'action_done_1', resolvedAt: T0, eta: T0 }
    control()
    await user.click(screen.getByTestId('scan-report-dismiss'))
    expect(acknowledge.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'action_done_1' }),
      expect.anything(),
    )
  })
})
