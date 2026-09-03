import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import React from 'react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// capability `system-space-view`, requirements *Burn Preview Reflects the
// Server-Solved Order, Without Committing* and *A Failed or Stale Preview Is
// Never Presented as a Current Quote* (tasks.md 4.1-4.5).
//
// THE CONTRACT — `frontend/hooks/use-burn-preview.ts`:
//
//   export interface UseBurnPreviewArgs {
//     fleetId: string | null
//     selection: SpaceSelection | null
//     // false while a commit of this same order would be refused: a running
//     // mine holding the movement channel, or a fleet in lane transit.
//     commitWouldBeAccepted: boolean
//   }
//   export interface BurnPreviewState {
//     preview: BurnPreview | null   // null while none has succeeded
//     stale: boolean                // a refresh failed over shown figures
//     noQuote: boolean              // the FIRST request for this selection failed
//     retry: () => void
//   }
//   export function useBurnPreview(args): BurnPreviewState
//
// The refresh cadence is `PREVIEW_REFRESH_MS` from `@/lib/realtime` — one
// named constant, one module (OQ-14 leaves its VALUE open, so nothing here
// asserts a number).
//
// VACUITY NOTES are inline. The structural one: the cadence tests count
// calls to `fleetService.preview` on fake timers, so a hook that fired on
// every render, or never fired, both fail; and the failure-state tests
// assert BOTH that figures are withheld AND that the command stays
// available, so "show nothing ever" does not pass.

vi.mock('@/lib/services', () => ({
  fleetService: { preview: vi.fn() },
}))

import { useBurnPreview } from './use-burn-preview'
import { fleetService } from '@/lib/services'
import { PREVIEW_REFRESH_MS } from '@/lib/realtime'
import type { BurnPreview } from '@/lib/types/fleet'

const mockPreview = vi.mocked(fleetService.preview)

const QUOTE: BurnPreview = {
  controlPoints: [
    { X: 0, Y: 0, Z: 0 },
    { X: 1, Y: 0, Z: 0 },
    { X: 2, Y: 0, Z: 0 },
    { X: 3, Y: 0, Z: 0 },
    { X: 4, Y: 0, Z: 0 },
    { X: 5, Y: 0, Z: 0 },
  ],
  departMs: 1000,
  arriveMs: 61000,
  deltaV: 120.5,
  fuelCostTons: 24.1,
  affordable: true,
  strandingWarning: false,
}

const SECOND_QUOTE: BurnPreview = { ...QUOTE, arriveMs: 62000, deltaV: 130.5, fuelCostTons: 26.1 }

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children)
  }
  return Wrapper
}

describe('useBurnPreview — requesting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreview.mockResolvedValue(QUOTE)
  })

  // Scenario: Selecting a target shows a preview curve and its figures
  it('Scenario: Selecting a target shows a preview curve and its figures', async () => {
    const { result } = renderHook(
      () =>
        useBurnPreview({
          fleetId: 'fleet_1',
          selection: { bodyId: 'feat-body-3' },
          commitWouldBeAccepted: true,
        }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.preview).not.toBeNull())
    expect(mockPreview).toHaveBeenCalledWith('fleet_1', { bodyId: 'feat-body-3' })
    expect(result.current.preview).toEqual(QUOTE)
    expect(result.current.noQuote).toBe(false)
    expect(result.current.stale).toBe(false)
  })

  // Scenario: A burning fleet's re-target is previewed
  it('Scenario: A burning fleet\'s re-target is previewed', async () => {
    // A burning fleet's re-target IS an ordinary commit, so the caller
    // passes `commitWouldBeAccepted: true` and the hook must request. An
    // earlier draft of the design forbade this while permitting the commit,
    // which is backwards.
    const { result } = renderHook(
      () =>
        useBurnPreview({
          fleetId: 'fleet_1',
          selection: { point: { X: 40, Y: 0, Z: -12 } },
          commitWouldBeAccepted: true,
        }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.preview).toEqual(QUOTE))
    expect(mockPreview).toHaveBeenCalledWith('fleet_1', { point: { X: 40, Y: 0, Z: -12 } })
  })

  // Scenario: No preview is requested while a mine holds the movement channel
  it('Scenario: No preview is requested while a mine holds the movement channel', async () => {
    const { result } = renderHook(
      () =>
        useBurnPreview({
          fleetId: 'fleet_1',
          selection: { bodyId: 'feat-body-3' },
          commitWouldBeAccepted: false,
        }),
      { wrapper: wrapper() },
    )
    // Give the query every opportunity to fire.
    await new Promise((r) => setTimeout(r, 20))
    expect(mockPreview, 'no request may go out when a commit would be refused').not.toHaveBeenCalled()
    expect(result.current.preview).toBeNull()
    expect(result.current.noQuote, 'a suppressed preview is not a FAILED preview').toBe(false)
  })

  it('SDET-added: no request goes out with an empty selection or no acting fleet', async () => {
    renderHook(
      () => useBurnPreview({ fleetId: 'fleet_1', selection: null, commitWouldBeAccepted: true }),
      { wrapper: wrapper() },
    )
    renderHook(
      () =>
        useBurnPreview({ fleetId: null, selection: { bodyId: 'b' }, commitWouldBeAccepted: true }),
      { wrapper: wrapper() },
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(mockPreview).not.toHaveBeenCalled()
  })

  // Scenario: Clearing the selection clears the preview
  it('Scenario: Clearing the selection clears the preview', async () => {
    const { result, rerender } = renderHook(
      ({ sel }: { sel: { bodyId: string } | null }) =>
        useBurnPreview({ fleetId: 'fleet_1', selection: sel, commitWouldBeAccepted: true }),
      { wrapper: wrapper(), initialProps: { sel: { bodyId: 'feat-body-3' } as { bodyId: string } | null } },
    )
    await waitFor(() => expect(result.current.preview).toEqual(QUOTE))
    rerender({ sel: null })
    await waitFor(() => expect(result.current.preview).toBeNull())
  })

  it('SDET-added: replacing the selection replaces the quote rather than showing the previous target\'s figures', async () => {
    mockPreview.mockResolvedValueOnce(QUOTE).mockResolvedValueOnce(SECOND_QUOTE)
    const { result, rerender } = renderHook(
      ({ sel }: { sel: { bodyId: string } }) =>
        useBurnPreview({ fleetId: 'fleet_1', selection: sel, commitWouldBeAccepted: true }),
      { wrapper: wrapper(), initialProps: { sel: { bodyId: 'a' } } },
    )
    await waitFor(() => expect(result.current.preview).toEqual(QUOTE))
    rerender({ sel: { bodyId: 'b' } })
    // It must NOT keep showing target a's figures as target b's quote.
    await waitFor(() => expect(result.current.preview).toEqual(SECOND_QUOTE))
    expect(mockPreview).toHaveBeenLastCalledWith('fleet_1', { bodyId: 'b' })
  })
})

describe('useBurnPreview — the refresh cadence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreview.mockResolvedValue(QUOTE)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // Scenario: The preview refreshes on exactly one named interval while shown
  it('Scenario: The preview refreshes on exactly one named interval while shown', async () => {
    const { result } = renderHook(
      () =>
        useBurnPreview({
          fleetId: 'fleet_1',
          selection: { bodyId: 'feat-body-3' },
          commitWouldBeAccepted: true,
        }),
      { wrapper: wrapper() },
    )
    await vi.advanceTimersByTimeAsync(0)
    expect(mockPreview, 'one request on selection').toHaveBeenCalledTimes(1)

    // Nothing between intervals — the endpoint reads the body table, may
    // write an arrival settlement, and runs an N-solve stranding scan per
    // acting fleet per player, so an ad-hoc cadence is a real server cost.
    await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS - 1)
    expect(mockPreview, 'no request between intervals').toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2)
    expect(mockPreview, 'exactly one request per elapsed interval').toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS)
    expect(mockPreview).toHaveBeenCalledTimes(3)

    // ...and the rendered figures follow the newest response.
    mockPreview.mockResolvedValue(SECOND_QUOTE)
    await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(result.current.preview).toEqual(SECOND_QUOTE)
  })

  it('SDET-added: the refresh stops when the selection is cleared', async () => {
    const { rerender } = renderHook(
      ({ sel }: { sel: { bodyId: string } | null }) =>
        useBurnPreview({ fleetId: 'fleet_1', selection: sel, commitWouldBeAccepted: true }),
      { wrapper: wrapper(), initialProps: { sel: { bodyId: 'a' } as { bodyId: string } | null } },
    )
    await vi.advanceTimersByTimeAsync(0)
    const before = mockPreview.mock.calls.length
    rerender({ sel: null })
    await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS * 3)
    expect(mockPreview.mock.calls.length, 'a cleared selection must stop the refresh').toBe(before)
  })
})

describe('useBurnPreview — failure states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Scenario: A failed first preview shows a no-quote state, not empty figures
  it('Scenario: A failed first preview shows a no-quote state, not empty figures', async () => {
    mockPreview.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(
      () =>
        useBurnPreview({ fleetId: 'fleet_1', selection: { bodyId: 'a' }, commitWouldBeAccepted: true }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.noQuote).toBe(true))
    // Not zeroes, not a previous target's figures — nothing at all.
    expect(result.current.preview).toBeNull()
    expect(result.current.stale).toBe(false)
  })

  // Scenario: A failed first preview offers a retry
  it('Scenario: A failed first preview offers a retry', async () => {
    mockPreview.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(
      () =>
        useBurnPreview({ fleetId: 'fleet_1', selection: { bodyId: 'a' }, commitWouldBeAccepted: true }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.noQuote).toBe(true))
    const before = mockPreview.mock.calls.length
    mockPreview.mockResolvedValue(QUOTE)
    await act(async () => {
      result.current.retry()
    })
    await waitFor(() => expect(result.current.preview).toEqual(QUOTE))
    expect(mockPreview.mock.calls.length).toBeGreaterThan(before)
    expect(result.current.noQuote).toBe(false)
  })

  // Scenario: A failed refresh marks the shown figures stale
  it('Scenario: A failed refresh marks the shown figures stale', async () => {
    mockPreview.mockResolvedValueOnce(QUOTE).mockRejectedValue(new Error('refresh failed'))
    vi.useFakeTimers()
    try {
      const { result } = renderHook(
        () =>
          useBurnPreview({ fleetId: 'fleet_1', selection: { bodyId: 'a' }, commitWouldBeAccepted: true }),
        { wrapper: wrapper() },
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(result.current.preview).toEqual(QUOTE)
      await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS + 1)
      await vi.advanceTimersByTimeAsync(0)
      expect(result.current.stale, 'a failed refresh must mark the figures stale').toBe(true)
      // The figures are still SHOWN — marked, not withdrawn — because
      // withdrawing them would leave the player with nothing at all.
      expect(result.current.preview).toEqual(QUOTE)
      expect(result.current.noQuote, 'this is not a no-quote state; a quote did succeed').toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // Scenario: A later successful refresh clears the stale marking
  it('Scenario: A later successful refresh clears the stale marking', async () => {
    mockPreview
      .mockResolvedValueOnce(QUOTE)
      .mockRejectedValueOnce(new Error('refresh failed'))
      .mockResolvedValue(SECOND_QUOTE)
    vi.useFakeTimers()
    try {
      const { result } = renderHook(
        () =>
          useBurnPreview({ fleetId: 'fleet_1', selection: { bodyId: 'a' }, commitWouldBeAccepted: true }),
        { wrapper: wrapper() },
      )
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS + 1)
      await vi.advanceTimersByTimeAsync(0)
      expect(result.current.stale).toBe(true)
      await vi.advanceTimersByTimeAsync(PREVIEW_REFRESH_MS + 1)
      await vi.advanceTimersByTimeAsync(0)
      expect(result.current.stale, 'a later success must clear the stale marking').toBe(false)
      expect(result.current.preview).toEqual(SECOND_QUOTE)
    } finally {
      vi.useRealTimers()
    }
  })
})
