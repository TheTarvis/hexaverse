import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { discoveryService } from '@/lib/services/discovery-service'
import { queryKeys } from '@/lib/query-keys'

export function useSurveyOptions(fleetId: string | null) {
  const phonePreview = process.env.NEXT_PUBLIC_PHONE_PREVIEW === 'true'
  return useQuery({
    queryKey: queryKeys.discovery.survey(fleetId ?? ''),
    queryFn: () => discoveryService.surveyOptions(fleetId!),
    enabled: !!fleetId,
    // A bounded preview read cadence reduces tunnel quota usage. Survey commits
    // still invalidate immediately; returning to the page refreshes stale facts.
    refetchInterval: phonePreview ? 10_000 : 1000,
    ...(phonePreview ? { staleTime: 0, refetchOnWindowFocus: true } : {}),
  })
}

export function useSurvey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fleetId, bodyId }: { fleetId: string; bodyId: string }) => discoveryService.survey(fleetId, bodyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.fleets.all })
      void qc.invalidateQueries({ queryKey: queryKeys.discovery.all })
    },
  })
}

export function useCelestialName() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ systemId, bodyId, name }: { systemId: string; bodyId: string; name: string }) => discoveryService.name(systemId, bodyId, name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.systemSpace.all })
      void qc.invalidateQueries({ queryKey: queryKeys.galaxy.all })
    },
  })
}
