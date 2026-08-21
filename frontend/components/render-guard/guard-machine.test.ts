// guard-machine.test.ts — table-driven over the FULL transition table pinned
// in design.md ("the shared guard module's public API"). This is the
// richest target in the suite: every row, including the four IDENTITY rows,
// which is where "a second loss changes nothing" and "a second retry starts
// nothing" are cheapest and strongest to assert (by reference, not merely by
// value).
//
// Covers, both capabilities (the machine is renderer-agnostic — one state
// machine drives board and galaxy alike):
//   - Context loss shows an interrupted state without an uncaught error
//   - A restored context resumes without navigation
//   - A context that never restores keeps the interrupted state with retry
//   - Invoking the retry affordance attempts to re-establish the context
//   - A successful retry resumes the live board/galaxy graph
//   - A retry that fails again keeps the interrupted state retriable
//   - The retry affordance prevents duplicate concurrent attempts
//   - A second context loss while already interrupted is a no-op state change
//   - Context creation failure shows a named unsupported state
//   - An unexpected rendering error is contained to the canvas region
//     (the renderError transition)
import { describe, it, expect } from 'vitest'
import { reduceGuard, type GuardState, type GuardStatus, type FailureCause } from './guard-machine'

function state(status: GuardStatus, cause: FailureCause | null): GuardState {
  return { status, cause }
}

const ALL_STATUSES: GuardStatus[] = ['live', 'unsupported', 'interrupted', 'retrying']

describe('reduceGuard — the loss/restore/retry transition table', () => {
  // --- any + probed{false} -> unsupported/creation --------------------------
  describe('any state + probed{supported:false} -> unsupported, cause creation', () => {
    it.each(ALL_STATUSES)('from %s', (from) => {
      const start = state(from, from === 'live' ? null : 'creation')
      const next = reduceGuard(start, { type: 'probed', supported: false })
      expect(next).toEqual({ status: 'unsupported', cause: 'creation' })
    })
  })

  // --- any + probed{true} -> live/null ---------------------------------------
  describe('any state + probed{supported:true} -> live, cause null', () => {
    it.each(ALL_STATUSES)('from %s', (from) => {
      const start = state(from, from === 'live' ? null : 'lost')
      const next = reduceGuard(start, { type: 'probed', supported: true })
      expect(next).toEqual({ status: 'live', cause: null })
    })
  })

  // --- live + contextLost -> interrupted/lost --------------------------------
  it('live + contextLost -> interrupted, cause lost (Scenario: Context loss shows an interrupted state without an uncaught error)', () => {
    const start = state('live', null)
    const next = reduceGuard(start, { type: 'contextLost' })
    expect(next).toEqual({ status: 'interrupted', cause: 'lost' })
  })

  // --- interrupted + contextLost -> IDENTITY ---------------------------------
  it('interrupted + contextLost -> identity, same object by reference (Scenario: A second context loss while already interrupted is a no-op state change)', () => {
    const start = state('interrupted', 'lost')
    const next = reduceGuard(start, { type: 'contextLost' })
    expect(next).toBe(start)
  })

  // --- interrupted + contextRestored -> live/null ----------------------------
  it('interrupted + contextRestored -> live, cause null (Scenario: A restored context resumes without navigation)', () => {
    const start = state('interrupted', 'lost')
    const next = reduceGuard(start, { type: 'contextRestored' })
    expect(next).toEqual({ status: 'live', cause: null })
  })

  // --- unsupported + contextRestored -> IDENTITY -----------------------------
  it('unsupported + contextRestored -> identity, same object by reference', () => {
    const start = state('unsupported', 'creation')
    const next = reduceGuard(start, { type: 'contextRestored' })
    expect(next).toBe(start)
  })

  // --- unsupported|interrupted + retryStarted -> retrying, cause preserved --
  describe('unsupported|interrupted + retryStarted -> retrying, cause preserved (Scenario: Invoking the retry affordance attempts to re-establish the context)', () => {
    it('from unsupported/creation', () => {
      const start = state('unsupported', 'creation')
      const next = reduceGuard(start, { type: 'retryStarted' })
      expect(next).toEqual({ status: 'retrying', cause: 'creation' })
    })
    it('from interrupted/lost', () => {
      const start = state('interrupted', 'lost')
      const next = reduceGuard(start, { type: 'retryStarted' })
      expect(next).toEqual({ status: 'retrying', cause: 'lost' })
    })
    it('from interrupted/restore-failed', () => {
      const start = state('interrupted', 'restore-failed')
      const next = reduceGuard(start, { type: 'retryStarted' })
      expect(next).toEqual({ status: 'retrying', cause: 'restore-failed' })
    })
  })

  // --- retrying + retryStarted -> IDENTITY -----------------------------------
  it('retrying + retryStarted -> identity, same object by reference (Scenario: The retry affordance prevents duplicate concurrent attempts)', () => {
    const start = state('retrying', 'creation')
    const next = reduceGuard(start, { type: 'retryStarted' })
    expect(next).toBe(start)
  })

  // --- retrying + retrySucceeded -> live/null ---------------------------------
  describe('retrying + retrySucceeded -> live, cause null (Scenario: A successful retry resumes the live board/galaxy graph)', () => {
    it('from retrying/creation', () => {
      const start = state('retrying', 'creation')
      const next = reduceGuard(start, { type: 'retrySucceeded' })
      expect(next).toEqual({ status: 'live', cause: null })
    })
    it('from retrying/lost', () => {
      const start = state('retrying', 'lost')
      const next = reduceGuard(start, { type: 'retrySucceeded' })
      expect(next).toEqual({ status: 'live', cause: null })
    })
  })

  // --- retrying + retryFailed -> cause-dependent back-transition -------------
  describe('retrying + retryFailed -> back to unsupported (creation) or interrupted (lost) (Scenario: A retry that fails again keeps the interrupted state retriable)', () => {
    it('retrying/creation + retryFailed -> unsupported/creation', () => {
      const start = state('retrying', 'creation')
      const next = reduceGuard(start, { type: 'retryFailed' })
      expect(next).toEqual({ status: 'unsupported', cause: 'creation' })
    })
    it('retrying/lost + retryFailed -> interrupted/lost', () => {
      const start = state('retrying', 'lost')
      const next = reduceGuard(start, { type: 'retryFailed' })
      expect(next).toEqual({ status: 'interrupted', cause: 'lost' })
    })
  })

  // --- retrying + contextLost -> IDENTITY -------------------------------------
  it('retrying + contextLost -> identity, same object by reference', () => {
    const start = state('retrying', 'creation')
    const next = reduceGuard(start, { type: 'contextLost' })
    expect(next).toBe(start)
  })

  // --- any + renderError{cause} -> interrupted if lost, else unsupported -----
  describe('any state + renderError{cause} -> interrupted iff cause is "lost", else unsupported (Scenario: An unexpected rendering error is contained to the canvas region)', () => {
    const causes: FailureCause[] = ['creation', 'lost', 'restore-failed']
    for (const from of ALL_STATUSES) {
      for (const cause of causes) {
        it(`from ${from}, cause ${cause}`, () => {
          const start = state(from, from === 'live' ? null : 'creation')
          const next = reduceGuard(start, { type: 'renderError', cause })
          if (cause === 'lost') {
            expect(next).toEqual({ status: 'interrupted', cause: 'lost' })
          } else {
            expect(next).toEqual({ status: 'unsupported', cause })
          }
        })
      }
    }
  })

  // --- SDET-added boundary probes ---------------------------------------------
  // Beyond the literal table: confirm reduceGuard is a pure function (no
  // mutation of the input state object) — load-bearing for the identity-row
  // assertions above to mean anything (a mutating reducer could pass a `toBe`
  // check by mutating in place).
  it('SDET-added: does not mutate the input state object', () => {
    const start = state('live', null)
    const snapshot = { ...start }
    reduceGuard(start, { type: 'contextLost' })
    expect(start).toEqual(snapshot)
  })

  // SDET-added: retryStarted from 'live' or 'retrying' with an event outside
  // the pinned table is intentionally NOT asserted here — inventing semantics
  // for an undefined transition is exactly what this suite must not do (see
  // report: "untestable as written" is for scenarios with no observable THEN,
  // not license to guess undefined transitions).
})
