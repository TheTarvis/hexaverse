'use client'

import { useRef, useMemo } from 'react'

// useSubmitGuard — the ONE shared synchronous double-submit guard
// (openspec change `build-production-space-view`, tasks.md 8.1; design.md
// Decision 8). Consumed by sell, mine, refuel, burn and jump.
//
// WHY A REF, AND WHY THIS SHAPE. `disabled={!pending}` driven by React
// Query's `isPending` is an ASYNC flip: it reaches the DOM a render later,
// so two activations in the same tick both enter the handler, each mints
// its own operation key, and server-side idempotency-by-key structurally
// cannot dedup them — the confirmed `commitSell` defect this change fixes,
// which reproduced 4/4 in Playwright on its refuel twin. The guard must
// therefore take effect WITHIN THE INVOCATION THAT SUBMITS, before any
// operation key is minted:
//
//   const guard = useSubmitGuard()
//   function commit() {
//     if (!guard.claim()) return          // <- before newOperationKey()
//     mutation.mutate(args, { onSettled: () => guard.release() })
//   }
//
// The returned object is stable across renders and its `held` is a live
// getter, so a handler closing over it always reads the current value.

export interface SubmitGuard {
  /** True iff THIS invocation acquired the guard. */
  claim(): boolean
  /** Release the guard — call from the mutation's `onSettled`. */
  release(): void
  /** Whether the guard is currently held. Observable synchronously. */
  readonly held: boolean
}

export function useSubmitGuard(): SubmitGuard {
  const heldRef = useRef(false)

  return useMemo<SubmitGuard>(
    () => ({
      claim() {
        if (heldRef.current) return false
        heldRef.current = true
        return true
      },
      release() {
        heldRef.current = false
      },
      get held() {
        return heldRef.current
      },
    }),
    [],
  )
}
