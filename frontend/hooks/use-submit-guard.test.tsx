import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// RED-PHASE SUITE — openspec change `build-production-space-view`,
// tasks.md 8.1; design.md Decision 8. Supports the four double-submit
// requirements: `docked-fleet-actions`'s *Mine* / *Sell* / *Refuel Control
// Guards Against Double-Submit* and `system-space-view`'s *Burn and Jump
// Commit Controls Guard Against Double-Submit*.
//
// READ THIS BEFORE TRUSTING THIS FILE.
//
// A unit test in the WRONG SHAPE proved this exact guarantee and was wrong:
// `hooks/use-refuel.test.tsx` asserted the refuel double-submit guard and
// PASSED against a handler that had no guard at all, because its harness
// held the mutation promise open by hand and waited for the disabled state
// BETWEEN the two clicks — stepping around the render race that was the
// entire defect. The Playwright equivalent failed 4/4.
//
// So this file deliberately does NOT claim to cover those four scenarios.
// It covers the GUARD PRIMITIVE's mechanism, in the one shape that can
// observe the failure: two invocations in a single synchronous block, with
// no `await`, no `act` boundary, and no render between them. The scenarios
// themselves are covered by `frontend/e2e/tests/space-double-submit.spec.ts`
// at browser level, per tasks.md 8.5, which forbids substituting unit tests.
//
// THE CONTRACT — `frontend/hooks/use-submit-guard.ts`:
//
//   export interface SubmitGuard {
//     claim(): boolean   // true iff THIS invocation acquired the guard
//     release(): void    // call from the mutation's onSettled
//     readonly held: boolean
//   }
//   export function useSubmitGuard(): SubmitGuard
//
// It MUST be ref-backed. A `useState`-backed implementation fails the very
// first test below, because the second `claim()` in the same tick reads the
// pre-render value — which is precisely the defect shape shipped in
// `commitSell`.
//
// VACUITY NOTE: `claim()` returning a constant fails — `true` always fails
// the double-claim test, `false` always fails the first-claim and
// release-then-reclaim tests.

import { useSubmitGuard } from './use-submit-guard'

describe('useSubmitGuard — the shared synchronous submit guard', () => {
  it('SDET-added: two claims in the SAME TICK, with no render between, yield exactly one acquisition', () => {
    const { result } = renderHook(() => useSubmitGuard())

    // One synchronous block. No await. No act between the two calls. This is
    // the exact shape the broken refuel test avoided.
    const outcomes: boolean[] = []
    outcomes.push(result.current.claim())
    outcomes.push(result.current.claim())

    expect(outcomes, 'the second same-tick claim must be refused').toEqual([true, false])
  })

  it('SDET-added: the guard is held immediately, before any re-render', () => {
    const { result } = renderHook(() => useSubmitGuard())
    const guard = result.current
    expect(guard.held).toBe(false)
    guard.claim()
    // Read through the SAME object reference the handler would still hold —
    // no re-render has occurred.
    expect(guard.held, 'the guard must be observable synchronously').toBe(true)
  })

  it('SDET-added: releasing lets the next user-initiated attempt through', () => {
    const { result } = renderHook(() => useSubmitGuard())
    expect(result.current.claim()).toBe(true)
    expect(result.current.claim()).toBe(false)
    act(() => result.current.release())
    expect(result.current.claim(), 'after release, a fresh attempt must be allowed').toBe(true)
  })

  it('SDET-added: releasing an unheld guard is a no-op, not a double-release bug', () => {
    const { result } = renderHook(() => useSubmitGuard())
    act(() => result.current.release())
    act(() => result.current.release())
    expect(result.current.claim()).toBe(true)
  })

  it('SDET-added: the guard survives a re-render without releasing itself', () => {
    const { result, rerender } = renderHook(() => useSubmitGuard())
    expect(result.current.claim()).toBe(true)
    rerender()
    expect(result.current.claim(), 'a re-render must not reopen the guard').toBe(false)
  })

  it('SDET-added: the guard is per-hook-instance, not module-global', () => {
    // Three copies of the guard is how the second and third one drift
    // (design.md Decision 8) — but one SHARED MODULE-LEVEL flag would make
    // a running mine block an unrelated sell.
    const a = renderHook(() => useSubmitGuard())
    const b = renderHook(() => useSubmitGuard())
    expect(a.result.current.claim()).toBe(true)
    expect(b.result.current.claim(), 'a second control must have its own guard').toBe(true)
  })

  it('SDET-added: a work function that throws still leaves the guard releasable', () => {
    const { result } = renderHook(() => useSubmitGuard())
    const boom = vi.fn(() => {
      throw new Error('mutate threw synchronously')
    })
    expect(result.current.claim()).toBe(true)
    expect(() => boom()).toThrow()
    act(() => result.current.release())
    expect(result.current.claim()).toBe(true)
  })
})
