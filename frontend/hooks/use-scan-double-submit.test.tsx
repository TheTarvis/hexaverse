// RED-phase integration test for openspec change
// add-scan-and-sightings-surface, tasks.md 5.10/5.11 — the scan commit
// control's MUTATION-LAYER double-submit guard (`system-space-view`: *The
// Scan Commit Control Guards Against Double-Submit*).
//
// MIRRORS `hooks/use-refuel.test.tsx`'s established rationale (a real
// double-click race is a mutation-layer guarantee, not a rendering-layer
// one — mounting the REAL hook against a REAL TanStack Query client,
// mocking only the transport boundary) — BUT DELIBERATELY DOES NOT COPY
// its SHAPE. That file's own two clicks are separated by
// `await waitFor(() => expect(...).toBeDisabled())` — stepping around the
// exact render race the double-submit requirement exists to survive
// (link8b-impl-contract.md §4.3 / README lesson: "a green test that cannot
// observe the failure"). This file's two activations below have NO awaited
// step and NO render between them, per tasks.md 5.11 in so many words.
//
// The guard under test is `hooks/use-submit-guard.ts`'s `useSubmitGuard` —
// task 5.10 is explicit that the scan control MUST adopt it rather than
// invent a second implementation — so this harness wires it exactly the way
// `FleetActionsPanel.tsx`'s own sell/mine/refuel controls already do:
// `guard.claim()` before minting anything, `guard.release()` on the
// mutation's `onSettled`.
//
// EXPECTED RED TODAY: `Cannot find module '@/hooks/use-scan'` — the scan
// commit mutation hook does not exist yet (task 4.8).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useScan } from '@/hooks/use-scan'
import { useSubmitGuard } from '@/hooks/use-submit-guard'
import { apiClient, type ApiResponse } from '@/lib/api-client'

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const mockPost = vi.mocked(apiClient.post)

function Harness({ fleetId, hostId }: { fleetId: string; hostId: string }) {
  const scan = useScan(fleetId)
  const guard = useSubmitGuard()

  function commit() {
    if (!guard.claim()) return
    scan.mutate({ hostId }, { onSettled: () => guard.release() })
  }

  return (
    <button type="button" data-testid="scan-commit-button" onClick={commit}>
      Sweep
    </button>
  )
}

function renderHarness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <Harness fleetId="fleet_1" hostId="feat-belt-1" />
    </QueryClientProvider>,
  )
}

const ok = (data: unknown = {}) => ({ data, status: 200, headers: new Headers() })

describe('useScan + useSubmitGuard — the scan control’s double-submit guard (system-space-view "The Scan Commit Control Guards Against Double-Submit")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Scenario: Two activations in one tick submit one scan commit — the
  // shape `hooks/use-refuel.test.tsx` failed to use. NO `await` and NO
  // render between the two `fireEvent.click` calls.
  it('two activations with no awaited step between them submit exactly one request', async () => {
    let resolvePost: (value: ApiResponse<unknown>) => void = () => {}
    mockPost.mockReturnValue(
      new Promise<ApiResponse<unknown>>((resolve) => {
        resolvePost = resolve
      }),
    )
    renderHarness()

    const button = screen.getByTestId('scan-commit-button')
    // Deliberately NOT awaited between these two — a render-dependent guard
    // (e.g. `disabled={mutation.isPending}`) would let BOTH calls through,
    // since `isPending` cannot have reached the DOM yet.
    fireEvent.click(button)
    fireEvent.click(button)

    resolvePost!(ok())
    await waitFor(() => expect(mockPost).toHaveBeenCalled())

    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  // Scenario: A double-click yields exactly one scan commit (jsdom's own
  // approximation of a real double-click: two rapid, synchronous clicks).
  it('a rapid double-click yields exactly one request', async () => {
    mockPost.mockResolvedValue(ok())
    renderHarness()
    const button = screen.getByTestId('scan-commit-button')

    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(() => expect(mockPost).toHaveBeenCalled())
    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  // Scenario: The guard releases when the request settles or fails — a
  // fresh attempt after a completed sweep commit is a second, independent
  // submission.
  it('releases the guard on settle, so a subsequent attempt submits normally', async () => {
    mockPost.mockResolvedValue(ok())
    renderHarness()
    const button = screen.getByTestId('scan-commit-button')

    fireEvent.click(button)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))

    fireEvent.click(button)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
  })

  // Scenario (SDET-added): the guard also releases on a FAILED commit, not
  // only a successful one — a rejected sweep (out of range, occluded, a
  // running sweep, lane transit, an unresolvable host) must not leave the
  // control permanently disabled.
  it('releases the guard when the request fails, not only when it succeeds', async () => {
    mockPost.mockRejectedValueOnce(new Error('disclosure: focused-scan target beyond range'))
    mockPost.mockResolvedValueOnce(ok())
    renderHarness()
    const button = screen.getByTestId('scan-commit-button')

    fireEvent.click(button)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))

    fireEvent.click(button)
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))
  })
})
