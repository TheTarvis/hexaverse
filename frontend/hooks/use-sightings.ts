'use client'

import { useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from '@tanstack/react-query'
import { sightingService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { SightingPage } from '@/lib/types/sighting'

// useSightings — the corporation's sighting pile (openspec change
// `add-scan-and-sightings-surface`, `sighting-records`), paged with the
// server's own opaque cursor (`sighting-log`: *The Log Pages Through the
// Pile With the Server's Own Cursor*).
//
// ONE HOOK, TWO CONSUMERS. `systemId` present is the ghost layer's
// system-filtered read (`SystemSpaceView`, one bounded page, never paged
// further); `systemId` null/absent is the sighting log's corp-wide read
// (paged on demand via `fetchNextPage`). The two are DIFFERENT cache
// entries (`queryKeys.sightings.pile`, task 4.7) — a system-filtered ghost
// read and the unfiltered log read must never share one.
//
// THE CLIENT NEVER CONSTRUCTS A CURSOR. `getNextPageParam` reads the
// PREVIOUS response's own `nextCursor` verbatim; an empty string is treated
// as "no further page" (`undefined`), which is exactly what
// `hasNextPage`/`fetchNextPage` key off.
export function useSightings(
  systemId?: string | null,
): UseInfiniteQueryResult<InfiniteData<SightingPage>, Error> {
  return useInfiniteQuery<SightingPage, Error, InfiniteData<SightingPage>>({
    queryKey: queryKeys.sightings.pile(systemId ?? null),
    queryFn: ({ pageParam }) =>
      sightingService.list({
        ...(systemId ? { systemId } : {}),
        ...(pageParam ? { cursor: pageParam as string } : {}),
      }),
    initialPageParam: '',
    getNextPageParam: (lastPage) => (lastPage.nextCursor ? lastPage.nextCursor : undefined),
  })
}
