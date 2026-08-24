// Market hooks (#0011) — the price board, a system's station, and the sell verb.
//
// Nothing here toasts: hooks own data and cache, components own user feedback
// (a hook that toasts stops being composable). The sell mutation surfaces the
// server's rejection reason as its error so the component can map it to
// player-facing copy.

'use client'

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'

import { queryKeys } from '@/lib/query-keys'
import { marketService } from '@/lib/services/market-service'
import type { MarketBoard, SellRequest, SellResult, Station } from '@/lib/types/market'

// The poll cadence used before the first board response arrives and tells us the
// server's own stated cadence. Matches market.Params.BoardRefreshCadence's
// default so the two agree from the first tick.
const DEFAULT_REFRESH_MS = 30_000

// useMarketBoard — the aggregate price board.
//
// Polled rather than pushed: a sale is instant and synchronous, so there is no
// ActionCompleted event to fan out over SSE. Freshness is a STATED contract
// instead, and the server names its own cadence in the response — a price up to
// that stale is acceptable for a decision that costs minutes of travel to act
// on.
export function useMarketBoard(enabled = true): UseQueryResult<MarketBoard, Error> {
  return useQuery<MarketBoard, Error>({
    queryKey: queryKeys.market.board(),
    queryFn: () => marketService.getBoard(),
    enabled,
    // Take the cadence from the server's own response once we have one, so
    // retuning it server-side reaches every client without a deploy.
    refetchInterval: (query) => query.state.data?.refreshCadenceMs ?? DEFAULT_REFRESH_MS,
    staleTime: DEFAULT_REFRESH_MS,
  })
}

// useStation — one system's trading station, or nothing when the requester's
// graph tier is below the gate (the server 404s; existence is hidden).
export function useStation(systemId: string | null): UseQueryResult<Station, Error> {
  return useQuery<Station, Error>({
    queryKey: queryKeys.market.station(systemId ?? ''),
    queryFn: () => marketService.getStation(systemId as string),
    enabled: !!systemId,
    // A 404 here is the ordinary "no visible station" answer, not a fault worth
    // retrying — retrying would also hammer the endpoint for every unstationed
    // system the player clicks.
    retry: false,
  })
}

// useSell — the instant settlement verb.
//
// On success it invalidates everything the sale moved: the fleet reads (the hold
// shrank), the corporation read (the balance grew), and the market board (the
// request it filled has less remaining). There is no ETA to schedule a refetch
// against — that is the whole point of an instant verb.
export function useSell(
  systemId: string,
): UseMutationResult<SellResult, Error, { fleetId: string; request: SellRequest }> {
  const qc = useQueryClient()
  return useMutation<SellResult, Error, { fleetId: string; request: SellRequest }>({
    mutationFn: ({ fleetId, request }) => marketService.sell(fleetId, request),
    onSuccess: (_result, { fleetId }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.inSystem(systemId) })
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.detail(fleetId) })
      void qc.invalidateQueries({ queryKey: queryKeys.market.board() })
      void qc.invalidateQueries({ queryKey: queryKeys.market.station(systemId) })
      // The balance rides the corporation record.
      void qc.invalidateQueries({ queryKey: queryKeys.corporations.me() })
    },
  })
}
