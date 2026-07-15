'use client'

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { actionService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { GameAction } from '@/lib/types/action'

// useRunningScan — the fleet's running scan, if any (#0006): the action whose
// frozen params (origin system + aim target) and eta let the board draw the
// committed beam and count down to resolution. Disabled until a fleet is in
// hand; the scan mutation invalidates `actions.running(fleetId)`. A stale
// past-eta entry is harmless — consumers hide it once worldTime passes eta.
export function useRunningScan(fleetId: string | null): UseQueryResult<GameAction | null, Error> {
  return useQuery<GameAction[], Error, GameAction | null>({
    queryKey: queryKeys.actions.running(fleetId ?? ''),
    queryFn: () => actionService.listRunning(fleetId!),
    enabled: !!fleetId,
    select: (actions) => actions.find((a) => a.type === 'scan' && a.status === 'running') ?? null,
  })
}
