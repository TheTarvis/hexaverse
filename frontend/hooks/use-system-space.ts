'use client'

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query'
import { systemService } from '@/lib/services'
import { queryKeys } from '@/lib/query-keys'
import type { SystemSpace } from '@/lib/types/system-space'

// useSystemSpace — the continuous-space interior read for one system
// (openspec change `build-production-space-view`, `system-interior`:
// *Interior Read Serves Continuous Bodies*). The successor to
// `useSystemBoard`: same endpoint, same cache key, a wire shape with no
// lattice left in it.
//
// Disabled until a non-empty system id is known, so a bare drill-in route
// never fires a `/v1/systems/` read.
export function useSystemSpace(
  systemId: string,
  options?: Omit<UseQueryOptions<SystemSpace, Error>, 'queryKey' | 'queryFn'>,
): UseQueryResult<SystemSpace, Error> {
  return useQuery<SystemSpace, Error>({
    queryKey: queryKeys.systemBoard.detail(systemId),
    queryFn: () => systemService.getSystemSpace(systemId),
    enabled: !!systemId && (options?.enabled ?? true),
    ...options,
  })
}
