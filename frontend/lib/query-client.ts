import { QueryClient } from '@tanstack/react-query'

// Don't retry on authentication/authorization errors or server errors
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof Error && 'status' in error) {
    const status = (error as Error & { status: number }).status
    // Don't retry on auth errors (401/403) or server errors (5xx)
    if (status === 401 || status === 403 || status >= 500) {
      return false
    }
  }
  return failureCount < 3
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
      retry: shouldRetry,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: (failureCount, error) => shouldRetry(failureCount, error) && failureCount < 1,
    },
  },
})