'use client'

// useReducedMotion — tracks the live `prefers-reduced-motion` media query
// (openspec change `fix-world-time-render-loop`, task 3.8, OQ1 folded in per
// USER RULING 1). Makes `system-space-view`'s already-live *Space View
// Respects Reduced-Motion Preference* (`spec.md:1323-1337`) reachable: the
// requirement's condition is "WHILE", a LIVE one, so detection must track
// the media query's `change` event for the component's lifetime, never a
// mount-only read.

import { useEffect, useRef, useState } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// `window.matchMedia` is called EXACTLY ONCE, in the lazy state initializer
// below — the same object is stashed in a ref and reused by the effect for
// both the initial sync and the add/remove listener pair, so the query is
// never re-run.
function readOnce(): { value: boolean; mql: MediaQueryList | null } {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return { value: false, mql: null }
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY)
  return { value: !!mql.matches, mql }
}

export function useReducedMotion(): boolean {
  const mqlRef = useRef<MediaQueryList | null>(null)
  const [reduced, setReduced] = useState<boolean>(() => {
    const { value, mql } = readOnce()
    mqlRef.current = mql
    return value
  })

  useEffect(() => {
    const mql = mqlRef.current
    if (!mql) return
    const sync = () => setReduced(!!mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])

  return reduced
}
