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
import type { Fleet, MineCommit, MineRequest, RoutePreview } from '@/lib/types/fleet'
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

// useMyFleets — the requester's own fleets across systems (transit included), the
// galaxy view's fleet layer (#0008). Enabled only when authed (a corp exists).
export function useMyFleets(
  options?: Omit<UseQueryOptions<Fleet[], Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<Fleet[], Error> {
  return useQuery<Fleet[], Error>({
    queryKey: queryKeys.fleets.mine(),
    queryFn: () => fleetService.listMine(),
    ...options,
  })
}

// useRoutePreview — the shortest lane route + ETAs from a fleet to a destination
// system (#0008), for the galaxy view's select→preview gesture. Disabled until
// both ids are known and the destination differs from the fleet's system. A
// no-charted-route destination surfaces as the query error (422), which the
// component renders as "no charted route" rather than a preview.
export function useRoutePreview(
  fleetId: string | null,
  destSystemId: string | null,
  options?: Omit<UseQueryOptions<RoutePreview, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<RoutePreview, Error> {
  return useQuery<RoutePreview, Error>({
    queryKey: queryKeys.fleets.route(fleetId ?? '', destSystemId ?? ''),
    queryFn: () => fleetService.previewRoute(fleetId!, destSystemId!),
    enabled: !!fleetId && !!destSystemId && (options?.enabled ?? true),
    retry: false, // a 422 "no route" is an answer, not a transient failure
    ...options,
  })
}

// useFleetTravel — commit a graph-tier trip (#0008). Success flips the fleet to
// lane-transit; invalidate the galaxy fleet layer, the fleet detail, and both the
// origin and destination system boards. Toasts belong in the component.
export function useFleetTravel(): UseMutationResult<
  Fleet,
  Error,
  { fleetId: string; systemId: string }
> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, { fleetId: string; systemId: string }>({
    mutationFn: ({ fleetId, systemId }) => fleetService.travel(fleetId, systemId),
    onSuccess: (fleet, { systemId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleet.id) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(fleet.systemId) })
      void qc.invalidateQueries({ queryKey: queryKeys.systemBoard.detail(fleet.systemId) })
      void qc.invalidateQueries({ queryKey: queryKeys.systemBoard.detail(systemId) })
    },
  })
}

// useScan — the 360° sweep verb (#0006 Decision #21): one manual trigger, no
// aim. Resolution mints observations at the ETA; completion arrives via SSE
// (useBoardRealtime), so success here just invalidates to reflect the running
// action. A 409 (a scan already running — movement doesn't block, #0006
// Decision #19) surfaces as the mutation error for the component to toast.
export function useScan(systemId: string): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.scan(fleetId),
    onSuccess: (fleet) => {
      invalidateBoard(qc, systemId, fleet)
      // The running-scan indicator reads the actions inbox — refresh it so the
      // committed sweep + countdown appear immediately.
      void qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleet.id) })
    },
  })
}

// useMine — the extraction verb (#0010, add-mine-ui): commit a run against the
// docked-at feature. Rides the movement channel (a 409 names the occupying
// action), so success refreshes the fleet reads (the claimed slot) and the
// actions inbox (the running-mine countdown) — the interior is untouched at
// commit; depletion lands at resolution via the board's refetch rules. The
// server's distinguishable rejection reason surfaces as the mutation error for
// the component to toast.
export function useMine(
  systemId: string,
): UseMutationResult<MineCommit, Error, { fleetId: string; request: MineRequest }> {
  const qc = useQueryClient()
  return useMutation<MineCommit, Error, { fleetId: string; request: MineRequest }>({
    mutationFn: ({ fleetId, request }) => fleetService.mine(fleetId, request),
    onSuccess: (_, { fleetId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleetId) })
    },
  })
}
