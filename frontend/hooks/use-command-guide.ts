'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { guideSnapshot, parseGuide, reconcileGuide, saveGuide, subscribeGuide } from '@/lib/command-onboarding'
import { actionService } from '@/lib/services/action-service'
import { queryKeys } from '@/lib/query-keys'
import { BOARD_POLL_MS } from '@/lib/realtime'
import type { Fleet } from '@/lib/types/fleet'

export function useCommandGuide(corporationId: string | null, fleets: Fleet[], fleetsFailed: boolean) {
  const snapshot = useSyncExternalStore(subscribeGuide, useCallback(() => guideSnapshot(corporationId), [corporationId]), () => null)
  const guide = useMemo(() => corporationId ? parseGuide(snapshot, corporationId) : null, [snapshot, corporationId])
  const mineActionId = guide?.phase === 'extraction' ? guide.mineActionId : guide?.phase === 'scanning' ? guide.scanActionId : null
  const action = useQuery({
    queryKey: queryKeys.actions.detail(corporationId ?? '', mineActionId ?? ''),
    queryFn: () => actionService.get(mineActionId!),
    enabled: !!corporationId && !!mineActionId,
    refetchInterval: BOARD_POLL_MS,
  })
  const fleet = !fleetsFailed ? fleets.find(f => f.id === guide?.fleetId) ?? null : null
  useEffect(() => {
    if (!guide || !fleet) return
    const next = reconcileGuide(guide, fleet, action.isError ? null : action.data ?? null)
    if (next !== guide) saveGuide(next)
  }, [guide, fleet, action.data, action.isError])
  return { guide, save: saveGuide, actionFailed: action.isError, retryAction: action.refetch }
}
