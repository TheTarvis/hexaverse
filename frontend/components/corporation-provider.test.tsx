import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CorporationProvider,
  useCorporationContext,
  useCorporationSessionOptional,
} from './corporation-provider'
import { corporationService } from '@/lib/services'

// corporation-provider.tsx imports account context relatively — mock the same
// specifier so vitest's resolver intercepts the module the provider actually uses.
vi.mock('./account-provider', () => ({
  useAccountContext: vi.fn(() => ({
    user: { uid: 'u1' },
    account: { id: 'a1' },
    isLoading: false,
  })),
}))

vi.mock('@/lib/services', () => ({
  corporationService: { getMine: vi.fn() },
}))

const mockGetMine = vi.mocked(corporationService.getMine)

// A bare consumer of the context. Reads are cast loosely (not through the typed
// `CorporationContextValue`) because this red-phase suite asserts fields
// (`isError`, `error`, `refetch`) the interface does not expose yet — that's the
// point: these tests pin the contract the provider must grow into.
function TestComponent() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = useCorporationContext() as any
  return (
    <div>
      <div data-testid="corporation-id">{ctx.corporation ? ctx.corporation.id : 'null'}</div>
      <div data-testid="is-loading">{String(ctx.isLoading)}</div>
      <div data-testid="needs-wake">{String(ctx.needsWake)}</div>
      <div data-testid="is-error">{String(ctx.isError)}</div>
      <div data-testid="error-status">{ctx.error ? String(ctx.error.status) : 'none'}</div>
      <div data-testid="has-refetch">{String(typeof ctx.refetch === 'function')}</div>
      <button data-testid="refetch-btn" onClick={() => ctx.refetch && ctx.refetch()}>
        retry
      </button>
    </div>
  )
}

function renderWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <CorporationProvider>
        <TestComponent />
      </CorporationProvider>
    </QueryClientProvider>
  )
}

describe('CorporationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Scenario: A network or server error on corp lookup does not trigger the wake-up flow', async () => {
    // getMine() rethrows non-404 failures (corporation-service.ts) — a 5xx/network
    // failure must surface as an error, and must NOT be read as "no corporation yet".
    mockGetMine.mockRejectedValue({ status: 500, message: 'boom' })

    renderWithClient()

    await waitFor(() => {
      expect(screen.getByTestId('is-error')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('error-status')).toHaveTextContent('500')
    // The defect this scenario guards: today a failed lookup collapses into
    // `corporation === null` (via `data ?? null`), so `needsWake` computes true —
    // an already-spawned player would be shown the full-screen wake-up flow on a
    // transient error. It must not.
    expect(screen.getByTestId('needs-wake')).toHaveTextContent('false')
  })

  it('Scenario: a 404 (mapped to null) still sets needsWake', async () => {
    // corporationService.getMine() already maps a 404 to a resolved `null` — this
    // is the genuine "no living corporation yet" signal, distinct from the error
    // case above, and must keep flipping the wake gate.
    mockGetMine.mockResolvedValue(null)

    renderWithClient()

    await waitFor(() => {
      expect(screen.getByTestId('needs-wake')).toHaveTextContent('true')
    })
    expect(screen.getByTestId('corporation-id')).toHaveTextContent('null')
  })

  it('Scenario: exposes refetch for a user-triggered retry', async () => {
    mockGetMine.mockRejectedValue({ status: 500, message: 'boom' })

    renderWithClient()

    await waitFor(() => {
      expect(screen.getByTestId('is-error')).toHaveTextContent('true')
    })

    // The provider must expose a `refetch` function on the context so
    // layout-wrapper.tsx can drive a user-triggered retry (parity with
    // account-provider's `refetchAccount`).
    expect(screen.getByTestId('has-refetch')).toHaveTextContent('true')

    mockGetMine.mockResolvedValue({ id: 'corp_1', accountId: 'a1', name: 'Bob', createdAt: 1, credits: 0 })
    fireEvent.click(screen.getByTestId('refetch-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('corporation-id')).toHaveTextContent('corp_1')
    })
    expect(screen.getByTestId('needs-wake')).toHaveTextContent('false')
    expect(mockGetMine).toHaveBeenCalledTimes(2)
  })
})

// =============================================================================
// ADDITIVE — add-vitals-strip, impl contract §6: `useCorporationSessionOptional`,
// beside `useCorporationOptional`. NON-THROWING (unlike `useCorporationContext`,
// which the space view must not call — a missing provider must never blank the
// board), and — unlike `useCorporationOptional`'s bare `corporation?.credits` —
// it surfaces `isError` too, which is what lets a consumer distinguish "resolved
// once and has since failed to refresh" from "currently resolved", the credits
// cell's stale-balance rule (round 1 MAJOR 7; system-console *The Credits Cell
// Shows the Corporation's Served Balance...*'s staleness clause).
//
// RED-PHASE: COMPILE-RED until `useCorporationSessionOptional` is exported.
// =============================================================================

function SessionTestComponent() {
  const { corporation, isError } = useCorporationSessionOptional()
  return (
    <div>
      <div data-testid="session-corp-id">{corporation ? corporation.id : 'null'}</div>
      <div data-testid="session-is-error">{String(isError)}</div>
    </div>
  )
}

describe('useCorporationSessionOptional', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('Scenario: no provider mounted -> returns { corporation: null, isError: false }, never throws', () => {
    // Deliberately NO <CorporationProvider> wrapper — this is the whole
    // point of the "Optional" accessor (contract §6.1).
    expect(() => render(<SessionTestComponent />)).not.toThrow()
    expect(screen.getByTestId('session-corp-id')).toHaveTextContent('null')
    expect(screen.getByTestId('session-is-error')).toHaveTextContent('false')
  })

  it('Scenario: a resolved session -> returns the corporation and isError=false', async () => {
    mockGetMine.mockResolvedValue({ id: 'corp_9', accountId: 'a1', name: 'Nine', createdAt: 1, credits: 500 })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <CorporationProvider>
          <SessionTestComponent />
        </CorporationProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('session-corp-id')).toHaveTextContent('corp_9'))
    expect(screen.getByTestId('session-is-error')).toHaveTextContent('false')
  })

  // The scenario this accessor exists to make reachable: a session that
  // resolved once and has SINCE failed to refresh must surface isError=true
  // ALONGSIDE the still-cached corporation object — so a caller (the space
  // view's `creditsShown` derivation) can distinguish "currently
  // unavailable, showing what was last confirmed" from "currently
  // available", per contract §6.3: `sessionFailed ? null :
  // (corporation?.credits ?? null)`. `useCorporationOptional`'s bare
  // `corporation?.credits` has NO reachable path to this distinction — that
  // is round 1 MAJOR 7's finding, and the reason this accessor exists at
  // all.
  it('Scenario: a session that resolved once and has since failed to refresh -> isError=true, corporation still cached (never discarded)', async () => {
    mockGetMine.mockResolvedValueOnce({ id: 'corp_9', accountId: 'a1', name: 'Nine', createdAt: 1, credits: 500 })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    function WithRefetch() {
      const session = useCorporationSessionOptional()
      const ctx = useCorporationContext()
      return (
        <div>
          <div data-testid="session-corp-id">{session.corporation ? session.corporation.id : 'null'}</div>
          <div data-testid="session-is-error">{String(session.isError)}</div>
          <button data-testid="refetch" onClick={() => ctx.refetch && ctx.refetch()}>
            retry
          </button>
        </div>
      )
    }
    render(
      <QueryClientProvider client={queryClient}>
        <CorporationProvider>
          <WithRefetch />
        </CorporationProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('session-corp-id')).toHaveTextContent('corp_9'))
    expect(screen.getByTestId('session-is-error')).toHaveTextContent('false')

    mockGetMine.mockRejectedValueOnce({ status: 500, message: 'boom' })
    fireEvent.click(screen.getByTestId('refetch'))

    await waitFor(() => expect(screen.getByTestId('session-is-error')).toHaveTextContent('true'))
    // THE CORE OF THE SCENARIO: the cached corporation is NOT discarded by
    // the failed refetch — a caller reading isError still has the object to
    // decide, on its own terms, to treat it as stale.
    expect(screen.getByTestId('session-corp-id')).toHaveTextContent('corp_9')
  })
})
