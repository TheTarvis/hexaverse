'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { fleetService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { Fleet } from '@/lib/types/fleet'
import type { Target } from '@/lib/hex'

// useFleetsInSystem — the fogged fleet layer for one system (#0004/#0007), the
// query backing the board's fleet glyphs. Own units always; foreign fleets only
// where the requester currently senses them (audience fog, server-side). Verb
// mutations (move/scan) invalidate `fleets.inSystem(id)`; the #0005 refetch rules
// (SSE, ETA self-schedule, gentle poll) drive re-reads while the board is open.
//
// Disabled until a non-empty systemId is known so a bare drill-in never fires a
// `/v1/fleets` read.
export function useFleetsInSystem(
  systemId: string,
  options?: Omit<UseQueryOptions<Fleet[], Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<Fleet[], Error> {
  return useQuery<Fleet[], Error>({
    queryKey: queryKeys.fleets.inSystem(systemId),
    queryFn: () => fleetService.listInSystem(systemId),
    enabled: !!systemId && (options?.enabled ?? true),
    ...options,
  })
}

// A committed verb invalidates the fleet layer AND the interior read (a scan
// reveals features; a move's ambient sweep can too). The self-scheduled ETA
// refetch (rule 1 of #0005) is driven by useBoardRealtime off the refreshed
// fleets, so the invalidation here is what re-arms it.
function invalidateBoard(
  qc: ReturnType<typeof useQueryClient>,
  systemId: string,
  fleet: Fleet,
): void {
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleet.id) })
  void qc.invalidateQueries({ queryKey: queryKeys.systemBoard.detail(systemId) })
}

// useFleetOrders — the move verbs (order-to + cancel) for fleets in a system. A
// successful order flips the fleet to burn (its committed path rides in the
// response) and invalidates the board. Toasts belong in the component, not here.
export function useFleetOrders(systemId: string): {
  order: UseMutationResult<Fleet, Error, { fleetId: string; target: Target }>
  cancel: UseMutationResult<Fleet, Error, string>
} {
  const qc = useQueryClient()
  const order = useMutation<Fleet, Error, { fleetId: string; target: Target }>({
    mutationFn: ({ fleetId, target }) => fleetService.order(fleetId, target),
    onSuccess: (fleet) => invalidateBoard(qc, systemId, fleet),
  })
  const cancel = useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.cancel(fleetId),
    onSuccess: (fleet) => invalidateBoard(qc, systemId, fleet),
  })
  return { order, cancel }
}

// useScan — the scan verb for a fleet. Resolution mints observations at the ETA;
// completion arrives via SSE (useBoardRealtime), so success here just invalidates
// to reflect the running action. A 409 (fleet already busy) surfaces as the
// mutation error for the component to toast.
export function useScan(systemId: string): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.scan(fleetId),
    onSuccess: (fleet) => invalidateBoard(qc, systemId, fleet),
  })
}
