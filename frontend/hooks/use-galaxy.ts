'use client'

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { galaxyService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import { useAccountContext } from '@/components/account-provider'
import type { Galaxy } from '@/lib/types/galaxy'

// Intersection, not `interface extends`: UseQueryResult is a discriminated
// union, which an interface cannot extend.
export type UseGalaxyResult = UseQueryResult<Galaxy, Error> & {
  /** True when the data is the frozen start area (logged-out), not the live galaxy. */
  isStartArea: boolean
}

// Picks live-vs-start-area by auth state:
//  - authed        -> GET /v1/galaxy (the live galaxy).
//  - logged-out    -> the frozen /galaxy/start-area.json static asset.
//
// While auth is still resolving we hold off (the query stays disabled) so we
// don't flash the start area to a user who's about to be recognised as signed in.
export function useGalaxy(
  options?: Omit<UseQueryOptions<Galaxy, Error>, 'queryKey' | 'queryFn'>,
): UseGalaxyResult {
  const { user, authLoading } = useAccountContext()
  const isAuthed = !!user

  const query = useQuery<Galaxy, Error>({
    queryKey: isAuthed ? queryKeys.galaxy.live() : queryKeys.galaxy.startArea(),
    queryFn: () => (isAuthed ? galaxyService.getGalaxy() : galaxyService.getStartArea()),
    // The start area is frozen and the live galaxy changes slowly; keep it warm.
    staleTime: 5 * 60 * 1000,
    enabled: !authLoading && (options?.enabled ?? true),
    ...options,
  })

  return { ...query, isStartArea: !isAuthed }
}
