import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  /**
   * MUTATION RETRY POLICY — openspec change `fix-mutation-retry-on-4xx`,
   * capability `mutation-retry-policy` (tasks.md 1.2 / 1.2b).
   *
   * Every `it()` below is named for the `#### Scenario:` it automates, so
   * coverage is greppable in both directions. The table lives at
   * `docs/plans/continous_space/handoffs/fix-mutation-retry-on-4xx-red-coverage.md`.
   *
   * SCOPE — read before "harmonising" anything. This block asserts the
   * MUTATION predicate only. The `retry logic` block above asserts the
   * QUERY predicate, whose 408 and no-status retries up to three times are
   * CORRECT for reads and are deliberately unchanged by this capability
   * (spec.md:38-41). The two predicates are supposed to disagree.
   *
   * The mutation predicate is side-effecting by design (RULING 45): it
   * writes one warning on the branch that authorizes the surviving
   * status-less resend, and only there. That is why `console.warn` is
   * spied for the whole block.
   */
  describe('mutation retry logic', () => {
    const mutationRetryFn = queryClient.getDefaultOptions().mutations?.retry as (
      failureCount: number,
      error: unknown
    ) => boolean

    /** An error as `api-client.ts`'s `createApiError` produces it: a status carried on the Error. */
    function withStatus(message: string, status: number): Error & { status: number } {
      const error = new Error(message) as Error & { status: number }
      error.status = status
      return error
    }

    /** The shape `api-client.ts:218-220` throws when its own AbortController fires. */
    function abortShapedTimeout(): Error {
      return new Error('Request timeout')
    }

    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('Scenario: A 409 conflict is not resent', () => {
      // The captured defect this change exists for: today's predicate
      // excludes only 401/403/5xx, so a 409 — a deterministic refusal of
      // the submitted payload — is resent with an identical body.
      const error = withStatus('Conflict', 409)

      expect(mutationRetryFn(0, error)).toBe(false)
      expect(mutationRetryFn(1, error)).toBe(false)
    })

    it('Scenario: A 5xx failure is not resent', () => {
      // Was `'should not retry mutations on 5xx server errors'`. Already
      // correct today — tasks.md 1.2 is explicit that this one is kept
      // passing, never inverted.
      expect(mutationRetryFn(0, withStatus('Server Error', 500))).toBe(false)
      expect(mutationRetryFn(1, withStatus('Server Error', 500))).toBe(false)

      // SDET-added boundary probes: the rest of the 5xx band, including its
      // lower edge and a non-standard upper code.
      expect(mutationRetryFn(0, withStatus('Bad Gateway', 502))).toBe(false)
      expect(mutationRetryFn(0, withStatus('Service Unavailable', 503))).toBe(false)
      expect(mutationRetryFn(0, withStatus('Unknown Server Error', 599))).toBe(false)
    })

    it('Scenario: 401 and 403 failures are not resent', () => {
      // Was `'should not retry mutations on 401 errors'` and
      // `'should not retry mutations on 403 errors'`, merged under the one
      // scenario that owns both. Already correct today.
      //
      // The API client's own force-refresh re-issue after a 401
      // (`api-client.ts:168-206`) is a CREDENTIAL retry, explicitly out of
      // this requirement's scope (spec.md:59-60). It never reaches this
      // predicate — it happens inside one `mutationFn` call — so there is
      // nothing to assert about it here.
      const unauthorized = withStatus('Unauthorized', 401)
      const forbidden = withStatus('Forbidden', 403)

      expect(mutationRetryFn(0, unauthorized)).toBe(false)
      expect(mutationRetryFn(1, unauthorized)).toBe(false)
      expect(mutationRetryFn(0, forbidden)).toBe(false)
      expect(mutationRetryFn(1, forbidden)).toBe(false)
    })

    it('Scenario: A 408 request timeout is not resent', () => {
      // THE REVERSAL. This replaces `'should retry mutations once on
      // retryable errors'`, which fed a 408 and asserted `true` at
      // failureCount 0 — today's buggy predicate codified as correct
      // (proposal.md, "Known, not merely possible").
      //
      // A 408 carries a response status, so it is a deterministic refusal
      // like any other 4xx however transient it looks (spec.md:62-65). Do
      // NOT satisfy this change by asserting some other 4xx instead: the
      // 408 case IS the reversal (tasks.md 1.2).
      const error = withStatus('Request Timeout', 408)

      expect(mutationRetryFn(0, error)).toBe(false)
      expect(mutationRetryFn(1, error)).toBe(false)
    })

    it('Scenario: A 4xx failure other than 401, 403, 408, or 409 is not resent', () => {
      // The requirement is the whole 4xx band, not an enumeration of the
      // four the other scenarios name.
      for (const status of [400, 404, 422, 429]) {
        const error = withStatus(`Client Error ${status}`, status)
        expect(mutationRetryFn(0, error), `a ${status} must not be resent`).toBe(false)
        expect(mutationRetryFn(1, error), `a ${status} must not be resent`).toBe(false)
      }

      // SDET-added boundary probes: both edges of the 4xx band.
      expect(mutationRetryFn(0, withStatus('Bad Request', 400))).toBe(false)
      expect(mutationRetryFn(0, withStatus('Client Closed Request', 499))).toBe(false)
    })

    it('Scenario: A transport failure with no response status is still resent exactly once', () => {
      // The one automatic resend this policy keeps. The 4xx/5xx widening
      // must not take it with it (tasks.md 1.1).
      //
      // "carrying the identical request payload" is not observable at the
      // predicate — React Query re-invokes `mutationFn` with the same
      // variables, and payload identity is the CALLER's property. The one
      // place it is false today (`use-market.ts:111` re-minting an
      // operation key inside `mutationFn`) is filed as its own defect by
      // RULING 47, not asserted here.
      const error = new Error('Failed to fetch')

      expect(mutationRetryFn(0, error)).toBe(true)
      expect(mutationRetryFn(1, error)).toBe(false)
      expect(mutationRetryFn(2, error)).toBe(false)
    })

    it('Scenario: A client-side request timeout is a status-less failure, not a 408', () => {
      // `api-client.ts:218-220` turns its own AbortController firing into
      // `new Error('Request timeout')` with NO status property. That is a
      // member of the status-less class and SHALL NOT be reclassified as a
      // 408 (spec.md:81-82).
      //
      // This assertion pins the PREDICATE only — it constructs its own
      // error and cannot observe `api-client.ts`. The other half of the
      // prohibition, that nothing attaches a 408 at the abort path, is
      // pinned in `api-client.test.ts`'s "timeout handling" test (tasks.md
      // 1.2c, adversary R3 MAJOR A).
      const error = abortShapedTimeout()

      expect(error).not.toHaveProperty('status')
      expect(mutationRetryFn(0, error)).toBe(true)
      expect(mutationRetryFn(1, error)).toBe(false)
    })

    it('Scenario: A failure carrying no status is classified by that absence, not by its cause', () => {
      // The class is defined by the observable key — no response status on
      // the error reaching the predicate — never by the cause (spec.md:72-93).
      // Every cause below must take the same arm, so a later
      // cause-specific narrowing (`instanceof Error`, `name === 'AbortError'`,
      // `instanceof TypeError`) goes red here.
      const abortNamed = new Error('The user aborted a request.')
      abortNamed.name = 'AbortError'

      const causes: Array<[string, unknown]> = [
        ['a response body that could not be parsed', new SyntaxError('Unexpected token < in JSON at position 0')],
        ['a lost connection', new TypeError('Failed to fetch')],
        ['an aborted request', abortNamed],
        ['a DNS failure', new Error('getaddrinfo ENOTFOUND api.hexaverse.test')],
        ['a thrown string', 'network is down'],
        ['a thrown null', null],
        ['a thrown undefined', undefined],
        ['a thrown plain object', { message: 'no status anywhere on me' }],
      ]

      for (const [cause, error] of causes) {
        expect(mutationRetryFn(0, error), `${cause}: expected exactly one resend`).toBe(true)
        expect(mutationRetryFn(1, error), `${cause}: expected no second resend`).toBe(false)
      }
    })

    it('Scenario: An automatic resend records that it happened', () => {
      // RULING 45: the surviving resend is invisible to the player and
      // invisible in the UI, so it records itself — otherwise a doubled
      // server-side request log is indistinguishable from a second user
      // attempt, which is the misreading that cost four analyses.
      const error = new Error('Failed to fetch')

      expect(mutationRetryFn(0, error)).toBe(true)
      expect(warnSpy).toHaveBeenCalledTimes(1)

      // The fixed marker is asserted, not merely the fact of a warning:
      // `console.warn('retry')` would satisfy a bare call-count assertion
      // and still be unattributable in a captured console log (adversary
      // R3 MINOR F).
      const recorded = warnSpy.mock.calls[0].map((arg) => String(arg)).join(' ')
      expect(recorded).toContain('automatic transport-level resend')
    })

    it('Scenario: A refused mutation records nothing', () => {
      // The record is written ONLY where a resend is authorized, so the
      // number of records equals the number of automatic resends.
      for (const status of [409, 408, 429, 400, 500]) {
        const error = withStatus(`Refused ${status}`, status)
        // "and no automatic resend is authorized" is part of this
        // scenario's WHEN, so it is asserted here rather than assumed.
        expect(mutationRetryFn(0, error), `a ${status} must not be resent`).toBe(false)
      }

      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('Scenario: An exhausted status-less failure records nothing', () => {
      // The predicate is invoked on EVERY failure of the attempt chain,
      // including the second, status-less one at failureCount 1 where it
      // returns false. An implementation that warns before consulting
      // `failureCount` emits two records for one resend (adversary R3
      // MAJOR C) and fails here.
      const error = new Error('Failed to fetch')

      expect(mutationRetryFn(0, error)).toBe(true)
      expect(mutationRetryFn(1, error)).toBe(false)

      expect(warnSpy).toHaveBeenCalledTimes(1)
    })
  })
})
