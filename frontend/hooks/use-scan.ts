'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { actionService, fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { GameAction } from '@/lib/types/action'
import type { Fleet } from '@/lib/types/fleet'
import type { ScanTargetList } from '@/lib/types/scan'

// The focused-scan hooks (openspec change `add-scan-and-sightings-surface`,
// `focused-scan` / `system-space-view`).

// useScanTargets — the server-served target list for one fleet
// (*The Focused-Scan Target List Comes From the Server, Never From a
// Client Predicate*). Disabled until a fleet is in hand. Wraps the
// service's unwrapped array back into `{targets}` — the shape the scan
// control reads (`scanTargets.data.targets`), mirroring the wire envelope.
export function useScanTargets(fleetId: string | null): UseQueryResult<ScanTargetList, Error> {
  return useQuery<ScanTargetList, Error>({
    queryKey: queryKeys.fleets.scanTargets(fleetId ?? ''),
    queryFn: async () => ({ targets: await fleetService.scanTargets(fleetId!) }),
    enabled: !!fleetId,
    // F2 (link8b-adversary-r8): a re-selected fleet re-issues the read
    // rather than serving a page cached under an earlier selection of the
    // SAME fleet — an A->B->A selection toggle must not re-serve A's page
    // captured before A's burn landed. Overrides the app-wide 60s
    // `staleTime` default (`lib/query-client.ts`) for this query alone.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

// useScan — commit a focused scan against a listed target's served host id.
// A successful commit invalidates the running-scan inbox read and the
// target list (task 4.9): the sensor slot just claimed changes both.
export function useScan(fleetId: string | null): UseMutationResult<Fleet, Error, { hostId: string }> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, { hostId: string }>({
    mutationFn: ({ hostId }) => fleetService.scan(fleetId as string, hostId),
    onSuccess: () => {
      if (!fleetId) return
      void qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.scanTargets(fleetId) })
    },
  })
}

/**
 * The most recently settled, unacknowledged action among a list — the
 * greatest `resolvedAt` wins, its `eta` breaking a tie
 * (`system-space-view`: *A Settled Sweep Reports Its Outcome...*). NEVER
 * the inbox's own arrival order, which carries no ordering guarantee.
 */
export function selectMostRecentlySettled(actions: GameAction[]): GameAction | null {
  const unacknowledged = actions.filter((a) => !a.acknowledgedAt)
  if (unacknowledged.length === 0) return null
  return unacknowledged.reduce((best, current) => {
    const bestResolved = best.resolvedAt ?? -Infinity
    const currentResolved = current.resolvedAt ?? -Infinity
    if (currentResolved !== bestResolved) return currentResolved > bestResolved ? current : best
    return current.eta > best.eta ? current : best
  })
}

// useSettledScan — the acting fleet's most recently settled, unacknowledged
// scan, from the TYPE-FILTERED settled inbox read (`type=scan&status=done`)
// — never the type-agnostic one, so a fleet's other settled work cannot
// displace an unacknowledged sweep report.
export function useSettledScan(fleetId: string | null): UseQueryResult<GameAction | null, Error> {
  return useQuery<GameAction[], Error, GameAction | null>({
    queryKey: queryKeys.actions.settled(fleetId ?? ''),
    queryFn: () => actionService.listSettled(fleetId!, { type: 'scan' }),
    enabled: !!fleetId,
    select: selectMostRecentlySettled,
  })
}
