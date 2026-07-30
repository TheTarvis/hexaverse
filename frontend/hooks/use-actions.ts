'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
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

// useRunningMine — the fleet's running mine, if any (#0010, add-mine-ui): the
// movement-channel twin of useRunningScan, sharing the same inbox query (one
// fetch, two selectors). The board disables mine/move and counts down from its
// frozen eta while one exists; consumers hide a stale past-eta entry once
// worldTime passes it (the gating lifts without navigation).
export function useRunningMine(fleetId: string | null): UseQueryResult<GameAction | null, Error> {
  return useQuery<GameAction[], Error, GameAction | null>({
    queryKey: queryKeys.actions.running(fleetId ?? ''),
    queryFn: () => actionService.listRunning(fleetId!),
    enabled: !!fleetId,
    select: (actions) => actions.find((a) => a.type === 'mine' && a.status === 'running') ?? null,
  })
}

// useCancelAction — the generic #0005 cancel for motionless verbs (mine; a
// burning fleet cancels through the fleet endpoint so a coast can settle).
// Success frees the actor's slot, so the inbox and the actor's fleet reads
// refresh together. Toasts belong in the component.
export function useCancelAction(
  systemId: string,
): UseMutationResult<GameAction, Error, { actionId: string; fleetId: string }> {
  const qc = useQueryClient()
  return useMutation<GameAction, Error, { actionId: string; fleetId: string }>({
    mutationFn: ({ actionId }) => actionService.cancel(actionId),
    onSuccess: (_, { fleetId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
    },
  })
}
