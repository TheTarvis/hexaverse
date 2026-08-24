'use client'

// Session context for the player's Corporation (#0009), sitting beside the
// account context. It decides the app's top-level gate: a signed-in account with
// no living corp must WAKE first (the wake-up flow); one with a corp plays.

import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { corporationService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { useAccountContext } from './account-provider'
import type { Corporation } from '@/lib/types/corporation'

interface CorporationContextValue {
  corporation: Corporation | null
  // True while we're still resolving whether the account has a corp.
  isLoading: boolean
  // True once we KNOW the signed-in account has no living corp — the wake gate.
  needsWake: boolean
  // D6 — a corp-lookup error (non-404, e.g. 5xx/network), distinct from the
  // genuine "no living corporation yet" signal (a resolved null). Optional
  // at the type level only (always provided at runtime by this provider) —
  // additive fields stay optional so existing test doubles that predate them
  // keep type-checking.
  isError?: boolean
  error?: unknown | null
  // D6 — exposed so layout-wrapper.tsx can drive a user-triggered retry
  // (parity with account-provider's refetchAccount).
  refetch?: () => void
}

const CorporationContext = createContext<CorporationContextValue | undefined>(undefined)

export function useCorporationContext() {
  const ctx = useContext(CorporationContext)
  if (ctx === undefined) {
    throw new Error('useCorporationContext must be used within CorporationProvider')
  }
  return ctx
}

// useCorporationOptional returns the corporation when a provider is present and
// null when one isn't, instead of throwing.
//
// For surfaces where the corporation is SUPPLEMENTARY rather than load-bearing —
// the board's credit readout, for instance. The board's real job is moving
// fleets; it must not go blank because a balance readout could not find its
// provider. Anything gated on having a corporation still uses the throwing
// accessor, so a genuine missing-provider bug on those surfaces stays loud.
export function useCorporationOptional(): Corporation | null {
  return useContext(CorporationContext)?.corporation ?? null
}

export function CorporationProvider({ children }: { children: React.ReactNode }) {
  const { user, account, isLoading: accountLoading } = useAccountContext()

  // Only ask once we have a signed-in account (the corp is keyed to it).
  const enabled = !!user && !!account && !accountLoading

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.corporations.me(),
    queryFn: () => corporationService.getMine(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const corporation = data ?? null
  const resolving = enabled && isLoading
  // getMine() returns null (not an error) for a corpless account, so a resolved
  // null is the signal to wake — not a loading or logged-out state. A
  // corp-lookup error (5xx/network) is NOT evidence of corplessness (D6/B1):
  // needsWake stays false whenever isError is true, whether or not a living
  // corporation was already cached (a cached corporation already makes
  // `corporation === null` false on its own — this guards the no-cache case).
  const needsWake = enabled && !resolving && !isError && corporation === null

  return (
    <CorporationContext.Provider
      value={{
        corporation,
        isLoading: resolving,
        needsWake,
        isError,
        error: error ?? null,
        refetch: () => {
          refetch()
        },
      }}
    >
      {children}
    </CorporationContext.Provider>
  )
}
