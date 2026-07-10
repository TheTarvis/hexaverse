'use client'

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { systemService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { SystemBoard } from '@/lib/types/system-board'

// useSystemBoard — the fogged interior read for one system (#0007), the query
// backing the hex board. React Query caches it under the factory key; later
// slices add the three #0005 refetch rules (SSE reconnect, own-ETA
// self-schedule, gentle open-board poll) and the verb mutations that invalidate
// `detail(id)`.
//
// The query is disabled until a non-empty systemId is known so a bare drill-in
// route never fires a `/v1/systems/` read.
export function useSystemBoard(
  systemId: string,
  options?: Omit<UseQueryOptions<SystemBoard, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<SystemBoard, Error> {
  return useQuery<SystemBoard, Error>({
    queryKey: queryKeys.systemBoard.detail(systemId),
    queryFn: () => systemService.getSystemBoard(systemId),
    enabled: !!systemId && (options?.enabled ?? true),
    ...options,
  })
}
