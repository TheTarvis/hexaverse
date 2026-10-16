/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ApiClient, apiClient, createQueryFn, createMutationFn } from './api-client'
import { auth } from './firebase'

// Mock Firebase auth
vi.mock('./firebase', () => ({
  auth: {
    currentUser: null,
  },
}))

// Mock fetch
global.fetch = vi.fn()

const mockUser = {
  getIdToken: vi.fn(),
  getIdTokenResult: vi.fn(),
}

/**
 * Helper to create a mock Response with both json() and text() methods.
 * The api-client uses response.text() then JSON.parse() for JSON content.
 */
function mockJsonResponse(data: unknown, status = 200, ok = true) {
  const body = JSON.stringify(data)
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => body,
  }
}

function mockErrorResponse(data: unknown, status: number, statusText: string) {
  const body = JSON.stringify(data)
  return {
    ok: false,
    status,
    statusText,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => body,
  }
}

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient({
      baseURL: 'https://api.example.com',
      timeout: 5000,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use default values when no config provided', () => {
      const defaultClient = new ApiClient()
      expect(defaultClient).toBeInstanceOf(ApiClient)
    })

    it('should use provided configuration', () => {
      const client = new ApiClient({
        baseURL: 'https://custom.api.com',
        timeout: 15000,
        headers: { 'X-Custom': 'value' },
      })
      expect(client).toBeInstanceOf(ApiClient)
    })
  })

  describe('authentication', () => {
    it('should make requests without auth when user is not logged in', async () => {
      ;(auth as any).currentUser = null
      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse({ data: 'test' }))

      await client.get('/test')

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        })
      )

      const headers = (fetch as any).mock.calls[0][1].headers
      expect(headers.get('Authorization')).toBeNull()
    })

    it('should include auth token when user is logged in', async () => {
      ;(auth as any).currentUser = mockUser
      // Mock getIdTokenResult to return a fresh token (not expiring soon)
      mockUser.getIdTokenResult.mockResolvedValue({
        token: 'mock-token',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      })

      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse({ data: 'test' }))

      await client.get('/test')

      const headers = (fetch as any).mock.calls[0][1].headers
      expect(headers.get('Authorization')).toBe('Bearer mock-token')
    })

    it('should handle token fetch failure gracefully', async () => {
      ;(auth as any).currentUser = mockUser
      // Mock getIdTokenResult to throw an error
      mockUser.getIdTokenResult.mockRejectedValue(new Error('Token fetch failed'))

      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse({ data: 'test' }))

      await client.get('/test')

      const headers = (fetch as any).mock.calls[0][1].headers
      expect(headers.get('Authorization')).toBeNull()
    })
  })

  describe('token refresh on 401', () => {
    it('should retry request with refreshed token on 401', async () => {
      ;(auth as any).currentUser = mockUser
      // Initial token fetch via getIdTokenResult (returns token not expiring soon)
      mockUser.getIdTokenResult.mockResolvedValue({
        token: 'expired-token',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      })
      // Force refresh on 401 returns fresh token
      mockUser.getIdToken.mockResolvedValueOnce('fresh-token')

      // First call returns 401
      ;(fetch as any)
        .mockResolvedValueOnce(mockErrorResponse({ error: 'Token expired' }, 401, 'Unauthorized'))
        // Retry call succeeds
        .mockResolvedValueOnce(mockJsonResponse({ data: 'success' }))

      const response = await client.get('/protected')

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(mockUser.getIdToken).toHaveBeenCalledTimes(1) // Only called for 401 refresh
      expect(mockUser.getIdToken).toHaveBeenCalledWith(true) // Force refresh
      expect(response.data).toEqual({ data: 'success' })
    })

    // SDET-added (add-fuel-as-cargo tasks.md 8.7; board-view "Sell Control
    // Guards Against Double-Submit" / "Refuel Control Guards Against
    // Double-Submit" — both scenarios titled "A transport-level retry of
    // the same attempt yields exactly one [sale|refuel]"). Neither
    // requirement is testable end-to-end without a live backend (there is
    // no real "lost response" to induce), but the MECHANISM both depend on
    // is entirely inside this client, generic to any POST, and IS
    // precisely testable here: a 401 retry resends the exact same request
    // body it was given — never re-serialized from a mutated source — so a
    // caller-supplied idempotency key embedded in that body (sell's/
    // refuel's `operationKey`) rides the retry unchanged, by construction,
    // with no per-verb retry logic required anywhere else in the app.
    it('resends the identical request body byte-for-byte on a 401 retry — what a caller-supplied idempotency key (e.g. sell/refuel’s operationKey) rides unchanged', async () => {
      ;(auth as any).currentUser = mockUser
      mockUser.getIdTokenResult.mockResolvedValue({
        token: 'expired-token',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      mockUser.getIdToken.mockResolvedValueOnce('fresh-token')

      ;(fetch as any)
        .mockResolvedValueOnce(mockErrorResponse({ error: 'Token expired' }, 401, 'Unauthorized'))
        .mockResolvedValueOnce(mockJsonResponse({ ok: true }))

      const body = { tons: 10, operationKey: 'idempotency-key-abc123' }
      await client.post('/fleets/f1/refuel', body)

      expect(fetch).toHaveBeenCalledTimes(2)
      const firstBody = (fetch as any).mock.calls[0][1].body
      const retryBody = (fetch as any).mock.calls[1][1].body
      expect(retryBody).toBe(firstBody) // the SAME already-serialized string, not re-built
      expect(JSON.parse(retryBody)).toEqual(body)
    })

    it('should throw error if retry also fails', async () => {
      ;(auth as any).currentUser = mockUser
      // Initial token fetch via getIdTokenResult
      mockUser.getIdTokenResult.mockResolvedValue({
        token: 'expired-token',
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      // Force refresh returns another token
      mockUser.getIdToken.mockResolvedValueOnce('fresh-token')

      ;(fetch as any)
        .mockResolvedValueOnce(mockErrorResponse({ error: 'Token expired' }, 401, 'Unauthorized'))
        .mockResolvedValueOnce(mockErrorResponse({ error: 'Invalid token' }, 401, 'Unauthorized'))

      await expect(client.get('/protected')).rejects.toThrow('Invalid token')
    })
  })

  describe('HTTP methods', () => {
    beforeEach(() => {
      ;(fetch as any).mockResolvedValue(mockJsonResponse({ success: true }))
    })

    it('should make GET requests', async () => {
      await client.get('/test')
      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        })
      )
    })

    it('should make POST requests with data', async () => {
      const data = { name: 'test' }
      await client.post('/test', data)

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
          body: JSON.stringify(data),
        })
      )
    })

    it('should make PUT requests with data', async () => {
      const data = { name: 'test' }
      await client.put('/test', data)

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
          body: JSON.stringify(data),
        })
      )
    })

    it('should make PATCH requests with data', async () => {
      const data = { name: 'test' }
      await client.patch('/test', data)

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
          body: JSON.stringify(data),
        })
      )
    })

    it('should make DELETE requests', async () => {
      await client.delete('/test')

      expect(fetch).toHaveBeenCalledWith('https://api.example.com/test',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        })
      )
    })
  })

  describe('response handling', () => {
    it('should parse JSON responses', async () => {
      const responseData = { message: 'success' }
      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse(responseData))

      const response = await client.get('/test')
      expect(response.data).toEqual(responseData)
      expect(response.status).toBe(200)
    })

    it('should parse text responses', async () => {
      const responseData = 'plain text response'
      ;(fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => responseData,
      })

      const response = await client.get('/test')
      expect(response.data).toBe(responseData)
    })

    it('should throw error for non-ok responses', async () => {
      ;(fetch as any).mockResolvedValueOnce(mockErrorResponse({ error: 'Resource not found' }, 404, 'Not Found'))

      await expect(client.get('/test')).rejects.toThrow('Resource not found')
    })
  })

  describe('timeout handling', () => {
    it('should timeout requests after specified duration', async () => {
      const slowClient = new ApiClient({ timeout: 100 })

      ;(fetch as any).mockImplementation(() =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            // Simulate AbortError
            const error = new Error('Request timeout')
            error.name = 'AbortError'
            reject(error)
          }, 200)
        })
      )

      await expect(slowClient.get('/test')).rejects.toThrow('Request timeout')

      // Scenario: A client-side request timeout is a status-less failure, not a 408
      // (openspec change `fix-mutation-retry-on-4xx`, capability
      // `mutation-retry-policy`, tasks.md 1.2c / adversary R3 MAJOR A).
      //
      // The mutation retry policy classifies a failure by the OBSERVABLE
      // absence of a response status, so this abort must carry none: attach a
      // `408` here as a "correctness improvement" and the app's one surviving
      // automatic transport resend disappears silently, falsifying
      // `docked-fleet-actions/spec.md:325-329`. `query-client.test.ts` cannot
      // catch that — it constructs its own error and never observes this file.
      // This is the assertion at the place that would attach it.
      await expect(slowClient.get('/test')).rejects.not.toHaveProperty('status')
    })
  })

  describe('utility functions', () => {
    it('should create query function', async () => {
      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse({ data: 'test' }))

      const queryFn = createQueryFn('/test')
      const result = await queryFn()

      expect(result).toEqual({ data: 'test' })
    })

    it('should create mutation function', async () => {
      ;(fetch as any).mockResolvedValueOnce(mockJsonResponse({ id: 1, name: 'created' }, 201))

      const mutationFn = createMutationFn('/test', 'POST')
      const result = await mutationFn({ name: 'test' })

      expect(result).toEqual({ id: 1, name: 'created' })
    })
  })
})

describe('default apiClient', () => {
  it('should export a default instance', () => {
    expect(apiClient).toBeInstanceOf(ApiClient)
  })
})


describe('explicit phone-preview API origin', () => {
  beforeEach(() => { (auth as any).currentUser = null })
  afterEach(() => vi.unstubAllEnvs())
  it('uses the gateway-relative API only for an explicitly opted-in default client', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', 'true')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://inherited-api.example')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }))
    await new ApiClient().get('/v1/account')
    expect(fetch).toHaveBeenLastCalledWith('/api/v1/account', expect.objectContaining({ credentials: 'include' }))
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    await new ApiClient({ baseURL: 'http://127.0.0.1:20201' }).get('/v1/account')
    expect(fetch).toHaveBeenLastCalledWith('http://127.0.0.1:20201/v1/account', expect.anything())
  })
  it('preserves the configured API in ordinary production builds', async () => {
    vi.stubEnv('NEXT_PUBLIC_PHONE_PREVIEW', 'false')
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://normal-api.example')
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } }))
    await new ApiClient().get('/v1/account')
    expect(fetch).toHaveBeenLastCalledWith('https://normal-api.example/v1/account', expect.anything())
  })
})
