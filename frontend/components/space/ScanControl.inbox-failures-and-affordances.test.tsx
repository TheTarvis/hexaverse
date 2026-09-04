import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// RED-PHASE ADDENDUM — openspec change add-scan-and-sightings-surface,
// task 6.14 (`system-space-view`'s "The Sweep Surface's Reads Fail
// Independently, Like Every Other Read This View Issues") plus a keyboard-
// operability coverage gap QA flagged: no test confirms the scan control's
// affordances are REAL focusable elements.
//
// A NEW FILE, distinct from the existing (immutable) `ScanControl.test.tsx`
// — mirrors that file's own lightweight component-mock pattern exactly
// (mocking `@/hooks/use-scan`/`@/hooks/use-actions` directly; this is a
// rendering-contract concern, not a real-wiring one, so a component mock is
// the right level — see `system-space-view.test.tsx`'s heavier harness for
// the SEPARATE settle-announcement scenario, which genuinely needs real
// SystemSpaceView wiring).

const scanTargets = { data: { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }, isLoading: false, isError: false, refetch: vi.fn() }
const scanMutation = { mutate: vi.fn(), isPending: false }
const runningScan: { data: { id: string; committedAt: number; eta: number } | null; isError: boolean; refetch: ReturnType<typeof vi.fn> } = {
  data: null, isError: false, refetch: vi.fn(),
}
const settledScan: { data: { id: string; reasonCode?: string; resolvedAt: number; eta: number } | null; isError: boolean; refetch: ReturnType<typeof vi.fn> } = {
  data: null, isError: false, refetch: vi.fn(),
}
const cancelAction = { mutate: vi.fn(), isPending: false }
const acknowledge = { mutate: vi.fn() }

vi.mock('@/hooks/use-scan', () => ({
  useScanTargets: () => scanTargets,
  useScan: () => scanMutation,
  useSettledScan: () => settledScan,
}))
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
    <ScanControl fleet={fleet() as any} worldTime={T0} onOpenLog={vi.fn()} {...over} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  runningScan.data = null
  runningScan.isError = false
  settledScan.data = null
  settledScan.isError = false
  scanTargets.data = { targets: [{ hostId: 'feat-belt-1', kind: 'body', durationMs: 4880 }] }
  scanTargets.isError = false
})

describe('ScanControl — the running-status and settled-status inbox reads fail independently (task 6.14)', () => {
  // Scenario: A failed inbox read withholds the commit control rather than
  // re-offering it.
  it('a failed RUNNING-status read shows the sweep state could not be read, offers retry, and withholds the commit control', () => {
    runningScan.isError = true
    control()

    expect(screen.getByText("This sweep's state could not be read.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(
      screen.queryByTestId('scan-target-select'),
      'a commit offered on an unread inbox is a commit the server would reject for a sweep already running',
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('scan-commit-button')).not.toBeInTheDocument()
  })

  // Scenario: A failed settled read withholds the report, not the verb.
  it('a failed SETTLED-status read shows the outcome could not be read, offers retry, and LEAVES the commit control offered', () => {
    settledScan.isError = true
    control()

    expect(screen.getByText("This sweep's outcome could not be read.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(
      screen.getByTestId('scan-target-select'),
      'a missing outcome withdraws a report, never the verb — the commit control must still be offered',
    ).toBeInTheDocument()
  })
})

describe('ScanControl — every affordance is a real, focusable element', () => {
  it('the target select, commit button, and log-open link are native focusable elements', () => {
    control()
    const select = screen.getByTestId('scan-target-select')
    const commit = screen.getByTestId('scan-commit-button')
    expect(select.tagName).toBe('SELECT')
    expect(commit.tagName).toBe('BUTTON')
    select.focus()
    expect(document.activeElement).toBe(select)
    commit.focus()
    expect(document.activeElement).toBe(commit)
  })

  it('the cancel affordance is a real, focusable button while a sweep runs', () => {
    runningScan.data = { id: 'action_running_1', committedAt: T0, eta: T0 + 5_000 }
    control()
    const cancel = screen.getByTestId('scan-cancel')
    expect(cancel.tagName).toBe('BUTTON')
    cancel.focus()
    expect(document.activeElement).toBe(cancel)
  })

  it('the report\'s dismiss affordance and the log-open affordance are real, focusable buttons', () => {
    settledScan.data = { id: 'action_done_1', resolvedAt: T0, eta: T0 }
    control()
    const dismiss = screen.getByTestId('scan-report-dismiss')
    expect(dismiss.tagName).toBe('BUTTON')
    dismiss.focus()
    expect(document.activeElement).toBe(dismiss)

    const openLog = screen.getByRole('button', { name: /open the sighting log/i })
    expect(openLog.tagName).toBe('BUTTON')
    openLog.focus()
    expect(document.activeElement).toBe(openLog)
  })
})
