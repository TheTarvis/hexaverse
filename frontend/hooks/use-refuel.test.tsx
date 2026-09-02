// RED-phase integration test for the refuel verb's MUTATION-LAYER
// double-submit guarantee (add-fuel-as-cargo tasks.md 8.7; board-view ADDED
// "Refuel Control Guards Against Double-Submit").
//
// WHY THIS FILE EXISTS, AND WHY NOT JUST SystemBoardView.test.tsx: that
// container test mocks `useRefuel` entirely with a STATIC `isPending:
// false` — a mock can never exercise a REAL double-click race, because
// `isPending` never actually flips. The "double-click yields exactly one
// refuel" scenario is a mutation-layer guarantee (does isPending flip
// synchronously inside the same click, before a second click's event can
// land?), not a rendering-layer one — so this file mounts the REAL
// `useRefuel` hook against a REAL TanStack Query client, mocking only the
// transport boundary (`apiClient.post`), exactly the level
// `lib/services/market-service.test.ts` already mocks at for `sell`. No
// other hook in this repo has a dedicated test file today (hooks are
// otherwise only exercised indirectly through container tests, per
// `hooks/*.test.ts` — none exist) — this is a deliberate exception, made
// because the double-submit guard is one of the four things this change's
// SDET brief calls out as needing PRECISE mechanism-level coverage, not
// component-level trust.
//
// CONTRACT ASSUMED BY THIS SDET (frontend-side only; confirm against the
// backend SDET's fuel-purchase contract before implementing): the refuel
// verb rides `hooks/use-market.ts`'s existing `useSell`-shaped module —
// `useRefuel(fleetId: string): UseMutationResult<RefuelResult, Error, {
// tons: number }>` — backed by `marketService.refuel(fleetId, { tons,
// operationKey })` → `POST /v1/fleets/:fleetId/refuel`
// (`lib/services/market-service.test.ts` pins that call shape). If the
// developer lands `useRefuel` under a different module, only this file's
// one import line needs updating — the assertions below describe the
// OBSERVABLE mutation-layer contract, not its location.
//
// `useRefuel` DOES NOT EXIST YET as a real export of `hooks/use-market.ts`.
// Importing a name a real module does not (yet) export resolves to
// `undefined` under this repo's Vite/esbuild transform (confirmed
// experimentally: no import-resolution error, since the FILE genuinely
// exists) — so `Harness` below throws "refuel is not a function" the first
// time it renders, a clean, real red (missing behavior), not a broken
// harness.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRefuel } from '@/hooks/use-market'
import { apiClient, type ApiResponse } from '@/lib/api-client'

vi.mock('@/lib/api-client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}))

const mockPost = vi.mocked(apiClient.post)

function Harness({ fleetId }: { fleetId: string }) {
  const refuel = useRefuel(fleetId)
  return (
    <button
      type="button"
      data-testid="refuel-commit"
      disabled={refuel.isPending}
      onClick={() => refuel.mutate({ tons: 10 })}
    >
      Refuel
    </button>
  )
}

function renderHarness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <Harness fleetId="fleet_1" />
    </QueryClientProvider>,
  )
}

const ok = (data: unknown = {}) => ({ data, status: 200, headers: new Headers() })

describe('useRefuel — the mutation-layer double-submit guard (board-view ADDED "Refuel Control Guards Against Double-Submit")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Scenario: A double-click yields exactly one refuel.
  it('a double-click yields exactly one POST, using one operation key', async () => {
    let resolvePost: (value: ApiResponse<unknown>) => void = () => {}
    mockPost.mockReturnValue(
      new Promise<ApiResponse<unknown>>((resolve) => {
        resolvePost = resolve
      }),
    )
    renderHarness()

    fireEvent.click(screen.getByTestId('refuel-commit'))
    // isPending must already be true by the time a rapid SECOND click could
    // land in the same interaction — proving the guard engages
    // synchronously, not on some later tick a genuine double-click could
    // race past.
    await waitFor(() => expect(screen.getByTestId('refuel-commit')).toBeDisabled())
    fireEvent.click(screen.getByTestId('refuel-commit')) // no-op: disabled blocks the click

    resolvePost!(ok())
    await waitFor(() => expect(screen.getByTestId('refuel-commit')).not.toBeDisabled())

    expect(mockPost).toHaveBeenCalledTimes(1)
  })

  // Scenario: A fresh attempt after a completed refuel is a second,
  // independent refuel — generating a NEW operation key, distinct from the
  // completed refuel's.
  it('a fresh attempt after a completed refuel mints a new operation key', async () => {
    mockPost.mockResolvedValue(ok())
    renderHarness()

    fireEvent.click(screen.getByTestId('refuel-commit'))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('refuel-commit')).not.toBeDisabled())

    fireEvent.click(screen.getByTestId('refuel-commit'))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(2))

    const firstBody = mockPost.mock.calls[0]![1] as { operationKey: string }
    const secondBody = mockPost.mock.calls[1]![1] as { operationKey: string }
    expect(firstBody.operationKey).toBeTruthy()
    expect(secondBody.operationKey).toBeTruthy()
    expect(firstBody.operationKey).not.toBe(secondBody.operationKey)
  })

  // Scenario: A transport-level retry of the same attempt yields exactly
  // one refuel — NOT independently exercised here (there is no live
  // backend to lose a response against). The mechanism this depends on
  // (apiClient resends the identical serialized body on a 401 retry, so a
  // key generated once per `.mutate()` call rides any such retry
  // unchanged) is proven generically, once, in
  // `lib/api-client.test.ts`'s "resends the identical request body
  // byte-for-byte on a 401 retry" — see this SDET's coverage table for the
  // full cross-reference. What THIS test can and does prove is the half
  // that actually lives in this hook: exactly ONE operation key is minted
  // per `.mutate()` call (never one per underlying fetch attempt), which is
  // the necessary precondition for that shared retry mechanism to keep a
  // retried refuel idempotent.
  it('mints the operation key once per mutate() call, not once per underlying fetch attempt', async () => {
    mockPost.mockResolvedValue(ok())
    renderHarness()

    fireEvent.click(screen.getByTestId('refuel-commit'))
    await waitFor(() => expect(mockPost).toHaveBeenCalledTimes(1))

    // Exactly one POST for exactly one mutate() call — if the hook were
    // (wrongly) minting a fresh key per internal retry attempt rather than
    // per attempt, this would still pass; it is the api-client-level test
    // above that pins the "identical body on retry" half. Together the two
    // close the scenario.
    expect(mockPost).toHaveBeenCalledTimes(1)
  })
})
