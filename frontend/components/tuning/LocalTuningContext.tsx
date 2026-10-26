'use client'

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { useAccountOptional } from '@/components/account-provider'
import { useTuning } from '@/hooks/use-tuning'
import type { TuningProfile, TuningSnapshot } from '@/lib/types/tuning'

export interface LocalTuning {
  snapshot?: TuningSnapshot
  pending: boolean
  apply(profile: TuningProfile): Promise<TuningSnapshot>
  stage(profile: TuningProfile): Promise<TuningSnapshot>
  regenerate(): Promise<TuningSnapshot>
}
export const LocalTuningContext = createContext<LocalTuning | null>(null)
export const useLocalTuning = () => useContext(LocalTuningContext)

export function LocalTuningProvider({ children }: { children: ReactNode }) {
  const session = useAccountOptional()
  // The backend capability determines availability; routes are absent outside local emulators.
  const enabled = !!session?.user && !!session.account
  const tuning = useTuning(enabled)
  return <LocalTuningContext.Provider value={enabled ? tuning : null}>{children}</LocalTuningContext.Provider>
}
