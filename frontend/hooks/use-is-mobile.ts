/**
 * useIsMobile Hook
 *
 * Detects if the current viewport is mobile-sized (below lg breakpoint).
 * Uses matchMedia for responsive detection.
 */

'use client'

import { useState, useEffect } from 'react'

/** lg breakpoint in Tailwind (1024px) */
const LG_BREAKPOINT = 1024

/**
 * Hook to detect if the viewport is mobile-sized
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check initial state
    const checkMobile = () => {
      setIsMobile(window.innerWidth < LG_BREAKPOINT)
    }

    // Set initial value
    checkMobile()

    // Create media query
    const mediaQuery = window.matchMedia(`(max-width: ${LG_BREAKPOINT - 1}px)`)

    // Handler for changes
    const handleChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches)
    }

    // Add listener
    mediaQuery.addEventListener('change', handleChange)

    // Cleanup
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  return isMobile
}
