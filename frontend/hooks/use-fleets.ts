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
import type { Fleet, FleetList, MineCommit, MineRequest, OrderRequest } from '@/lib/types/fleet'

// MyFleetsResult — `useMyFleets`'s own shape (openspec change
// `fix-world-time-render-loop`, task 3.4, impl contract §4). `data` KEEPS
// the `Fleet[]` shape every existing consumer already reads it as
// (`FleetRoster.tsx`, `SystemSpaceView.tsx`, `GalaxyView.tsx`); `scale` and
// `worldTime` are the ENVELOPE's served values — never a per-fleet one —
// which is what lets a fleetless requester's clock still anchor on a served
// scale (`GalaxyView`'s unserved-scale hold names the alternative).
export type MyFleetsResult = Omit<UseQueryResult<FleetList, Error>, 'data'> & {
  data: Fleet[] | undefined
  scale: number | undefined
  worldTime: number | undefined
}

// useMyFleets — the requester's own fleets across systems, the source both
// the roster panel and the board's mine/sell surface read from (the board
// itself fetches no fleet data — design.md Decision 12). Enabled only when
// authed (a corp exists).
export function useMyFleets(
  options?: Omit<UseQueryOptions<FleetList, Error>, 'queryKey' | 'queryFn'>,
): MyFleetsResult {
  const query = useQuery<FleetList, Error>({
    queryKey: queryKeys.fleets.mine(),
    queryFn: () => fleetService.listMine(),
    ...options,
  })
  return { ...query, data: query.data?.fleets, scale: query.data?.scale, worldTime: query.data?.worldTime }
}

function invalidateFleet(qc: ReturnType<typeof useQueryClient>, fleet: Fleet): void {
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleet.id) })
  void qc.invalidateQueries({ queryKey: queryKeys.systemSpace.detail(fleet.systemId) })
}

// add-scan-and-sightings-surface (F4, link8b-adversary-r8): cut drive, stop,
// hold and release each rewrite the fleet's served kinematic state
// (park-mode flip, burn->drift, `attachedTo` cleared) with NO scheduled ETA
// to land later — cut drive in particular RETIRES the only scheduled
// trigger the fleet had (its burn's arrival never lands), so without this
// nothing ever refetches that fleet's scan-target list again. Deliberately
// NOT wired into `useOrder`/`useJump`: those commits land LATER, through
// the ETA-scheduled refetch, and invalidating at commit time would price a
// target list against a position the fleet has not reached yet.
function invalidateScanTargets(qc: ReturnType<typeof useQueryClient>, fleetId: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.fleets.scanTargets(fleetId) })
}

// useOrder — commit a burn to a body id or an explicit point (fleet-movement
// "In-System Burn Order to a Body or a Point"), the roster's burn command.
export function useOrder(): UseMutationResult<
  Fleet,
  Error,
  { fleetId: string; request: OrderRequest }
> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, { fleetId: string; request: OrderRequest }>({
    mutationFn: ({ fleetId, request }) => fleetService.order(fleetId, request),
    onSuccess: (fleet) => invalidateFleet(qc, fleet),
  })
}

// useCutDrive — free, instant: converts the active burn to a drift
// (fleet-movement "Cut Drive Converts the Burn to a Drift and Goes Dark").
export function useCutDrive(): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.cutDrive(fleetId),
    onSuccess: (fleet) => {
      invalidateFleet(qc, fleet)
      invalidateScanTargets(qc, fleet.id)
    },
  })
}

// useStop — a velocity-nulling burn (or an instant conversion below the
// speed floor) (fleet-movement "Stop In Place Commits a Velocity-Nulling
// Burn").
export function useStop(): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.stop(fleetId),
    onSuccess: (fleet) => {
      invalidateFleet(qc, fleet)
      invalidateScanTargets(qc, fleet.id)
    },
  })
}

// useJump — a single-hop lane crossing from a docked, charted gate
// (fleet-movement "Lane Jump From a Docked Gate").
export function useJump(): UseMutationResult<Fleet, Error, { fleetId: string; laneId: string }> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, { fleetId: string; laneId: string }>({
    mutationFn: ({ fleetId, laneId }) => fleetService.jump(fleetId, laneId),
    onSuccess: (fleet) => invalidateFleet(qc, fleet),
  })
}

// useHold / useRelease — the station-keeping verbs
// (add-stationkeep-hold-verb). Both settle SYNCHRONOUSLY: no action, no ETA,
// so there is nothing to schedule a refetch against — the response IS the
// fleet in its new park mode. Both shipped server-side with no client at
// all; this change is the first thing to give them one.
export function useHold(): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.hold(fleetId),
    onSuccess: (fleet) => {
      invalidateFleet(qc, fleet)
      invalidateScanTargets(qc, fleet.id)
    },
  })
}

export function useRelease(): UseMutationResult<Fleet, Error, string> {
  const qc = useQueryClient()
  return useMutation<Fleet, Error, string>({
    mutationFn: (fleetId) => fleetService.release(fleetId),
    onSuccess: (fleet) => {
      invalidateFleet(qc, fleet)
      invalidateScanTargets(qc, fleet.id)
    },
  })
}

// useMine — the extraction verb: commit a run against the docked-at
// feature. Rides the movement channel (a 409 names the occupying action),
// so success refreshes the fleet reads (the claimed slot), the interior
// (`systemId`, for the resolved cargo/depletion), and the actions inbox
// (the running-mine countdown).
export function useMine(
  systemId: string,
): UseMutationResult<MineCommit, Error, { fleetId: string; request: MineRequest }> {
  const qc = useQueryClient()
  return useMutation<MineCommit, Error, { fleetId: string; request: MineRequest }>({
    mutationFn: ({ fleetId, request }) => fleetService.mine(fleetId, request),
    onSuccess: (_, { fleetId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.mine() })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.systemSpace.detail(systemId) })
      void qc.invalidateQueries({ queryKey: queryKeys.actions.running(fleetId) })
    },
  })
}
