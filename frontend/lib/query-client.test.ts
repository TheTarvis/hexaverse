import { describe, it, expect } from 'vitest'
import { queryClient } from './query-client'

describe('queryClient', () => {
  describe('default options', () => {
    it('should have correct staleTime', () => {
      expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(60 * 1000)
    })

    it('should have correct gcTime', () => {
      expect(queryClient.getDefaultOptions().queries?.gcTime).toBe(5 * 60 * 1000)
    })

    it('should not refetch on window focus', () => {
      expect(queryClient.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false)
    })
  })

  describe('retry logic', () => {
    const retryFn = queryClient.getDefaultOptions().queries?.retry as (
      failureCount: number,
      error: unknown
    ) => boolean

    it('should not retry on 401 errors', () => {
      const error = new Error('Unauthorized') as Error & { status: number }
      error.status = 401

      expect(retryFn(0, error)).toBe(false)
      expect(retryFn(1, error)).toBe(false)
      expect(retryFn(2, error)).toBe(false)
    })

    it('should not retry on 403 errors', () => {
      const error = new Error('Forbidden') as Error & { status: number }
      error.status = 403

      expect(retryFn(0, error)).toBe(false)
      expect(retryFn(1, error)).toBe(false)
      expect(retryFn(2, error)).toBe(false)
    })

    it('should not retry on 5xx server errors', () => {
      const error = new Error('Server Error') as Error & { status: number }
      error.status = 500

      expect(retryFn(0, error)).toBe(false)
    })

    it('should retry up to 3 times on retryable errors', () => {
      const error = new Error('Request Timeout') as Error & { status: number }
      error.status = 408

      expect(retryFn(0, error)).toBe(true)
      expect(retryFn(1, error)).toBe(true)
      expect(retryFn(2, error)).toBe(true)
      expect(retryFn(3, error)).toBe(false)
    })

    it('should retry on errors without status', () => {
      const error = new Error('Network Error')

      expect(retryFn(0, error)).toBe(true)
      expect(retryFn(1, error)).toBe(true)
      expect(retryFn(2, error)).toBe(true)
      expect(retryFn(3, error)).toBe(false)
    })

    it('should retry on non-Error objects', () => {
      expect(retryFn(0, 'string error')).toBe(true)
      expect(retryFn(0, null)).toBe(true)
      expect(retryFn(0, undefined)).toBe(true)
    })
  })

  describe('mutation retry logic', () => {
    const mutationRetryFn = queryClient.getDefaultOptions().mutations?.retry as (
      failureCount: number,
      error: unknown
    ) => boolean

    it('should not retry mutations on 401 errors', () => {
      const error = new Error('Unauthorized') as Error & { status: number }
      error.status = 401

      expect(mutationRetryFn(0, error)).toBe(false)
    })

    it('should not retry mutations on 403 errors', () => {
      const error = new Error('Forbidden') as Error & { status: number }
      error.status = 403

      expect(mutationRetryFn(0, error)).toBe(false)
    })

    it('should not retry mutations on 5xx server errors', () => {
      const error = new Error('Server Error') as Error & { status: number }
      error.status = 500

      expect(mutationRetryFn(0, error)).toBe(false)
    })

    it('should retry mutations once on retryable errors', () => {
      const error = new Error('Request Timeout') as Error & { status: number }
      error.status = 408

      expect(mutationRetryFn(0, error)).toBe(true)
      expect(mutationRetryFn(1, error)).toBe(false)
    })
  })
})
