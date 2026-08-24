import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CorporationProvider, useCorporationContext } from './corporation-provider'
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
