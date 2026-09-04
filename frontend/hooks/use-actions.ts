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

// useRunningScan — the fleet's running focused scan, if any
// (add-scan-and-sightings-surface, `system-space-view`: *A Running Sweep's
// Window and Cancel Come From the Action Inbox*): the action whose
// committed time and eta the scan control counts down against, against the
// VIEW's own scale-correct projected world time — never a world time this
// read serves. Disabled until a fleet is in hand; the scan mutation
// invalidates `actions.running(fleetId)`. A stale past-eta entry is
// harmless — consumers present it as settling once worldTime passes eta,
// per the self-scheduled post-eta refetch that settles it.
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
      // add-scan-and-sightings-surface (task 4.9): a cancelled sweep frees
      // the sensor slot, so the target list is stale the instant the
      // cancel succeeds — a no-op invalidation for every OTHER cancellable
      // verb, which has no scan-targets cache entry to begin with.
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.scanTargets(fleetId) })
    },
  })
}

// useAcknowledgeAction — the generic #0005 acknowledge, marking a settled
// action's report as read (add-scan-and-sightings-surface, `system-space-
// view`: *A Settled Sweep Reports Its Outcome...* — "Dismissing a report
// acknowledges the action, so a subsequent refetch does not report the same
// settled sweep again"). Success refreshes that fleet's settled-inbox read.
export function useAcknowledgeAction(): UseMutationResult<
  GameAction,
  Error,
  { actionId: string; fleetId: string }
> {
  const qc = useQueryClient()
  return useMutation<GameAction, Error, { actionId: string; fleetId: string }>({
    mutationFn: ({ actionId }) => actionService.acknowledge(actionId),
    onSuccess: (_, { fleetId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.actions.settled(fleetId) })
    },
  })
}
