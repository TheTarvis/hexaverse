import { QueryClient } from '@tanstack/react-query'

/**
 * The response status a failure exposes, or `undefined` when it exposes none.
 *
 * This is the ONE observable key the mutation policy classifies on
 * (`mutation-retry-policy`): a failure is status-less when the error reaching
 * the predicate carries no response status, whatever the cause — a lost
 * connection, a DNS failure, the API client's own request-timeout abort, an
 * unreadable response body, or a thrown value that is not an `Error` at all.
 * Never test the cause (`instanceof Error`, `name === 'AbortError'`,
 * `instanceof TypeError`): that narrowing is what the capability forbids.
 */
function responseStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === 'number') {
      return status
    }
  }
  return undefined
}

// QUERY retry. Unchanged: reads keep retrying 408 and status-less failures up
// to 3 times. A repeated read is free of the doubling hazard that governs
// mutations, so the two predicates deliberately disagree.
// Don't retry on authentication/authorization errors or server errors
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && 'status' in error) {
    const status = (error as Error & { status: number }).status
    // Don't retry on auth errors (401/403) or server errors (5xx)
    if (status === 401 || status === 403 || status >= 500) {
      return false
    }
  }
  return failureCount < 3
}

/**
 * MUTATION retry (`mutation-retry-policy`).
 *
 * A failure that carries a response status is never resent automatically: a
 * `4xx` is a deterministic refusal of the submitted payload however transient
 * it looks (`408`, `429`), and a `5xx` is excluded exactly as it always was.
 * Only a failure carrying no response status — which means no response was
 * read, NOT that the request failed to reach the server — is worth exactly one
 * automatic resend.
 *
 * The predicate is side-effecting by design (RULING 45): that surviving resend
 * is invisible to the player and invisible in the UI, so it records itself,
 * and a doubled server-side request stays attributable to this policy rather
 * than to a second player attempt. `failureCount` is consulted BEFORE the
 * record is written, so the number of records equals the number of resends.
 */
function shouldRetryMutation(failureCount: number, error: unknown): boolean {
  if (responseStatus(error) !== undefined) {
    // A response was read and refused the payload. Refusing again resends an
    // identical body the server has already rejected — worse, on a surface
    // that mints no per-attempt operation key, than a failure the player can
    // see and re-issue deliberately.
    return false
  }

  if (failureCount < 1) {
    console.warn(
      '[query-client] automatic transport-level resend: a mutation failed with no response status; resending once',
      error
    )
    return true
  }

  return false
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: shouldRetryMutation,
    },
  },
})
