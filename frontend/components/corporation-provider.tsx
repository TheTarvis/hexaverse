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
}

const CorporationContext = createContext<CorporationContextValue | undefined>(undefined)

export function useCorporationContext() {
  const ctx = useContext(CorporationContext)
  if (ctx === undefined) {
    throw new Error('useCorporationContext must be used within CorporationProvider')
  }
  return ctx
}

export function CorporationProvider({ children }: { children: React.ReactNode }) {
  const { user, account, isLoading: accountLoading } = useAccountContext()

  // Only ask once we have a signed-in account (the corp is keyed to it).
  const enabled = !!user && !!account && !accountLoading

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.corporations.me(),
    queryFn: () => corporationService.getMine(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const corporation = data ?? null
  const resolving = enabled && isLoading
  // getMine() returns null (not an error) for a corpless account, so a resolved
  // null is the signal to wake — not a loading or logged-out state.
  const needsWake = enabled && !resolving && corporation === null

  return (
    <CorporationContext.Provider value={{ corporation, isLoading: resolving, needsWake }}>
      {children}
    </CorporationContext.Provider>
  )
}
