'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tuningService } from '@/lib/services/tuning-service'
import { queryKeys } from '@/lib/query-keys'
import type { TuningProfile, TuningSnapshot } from '@/lib/types/tuning'

export function useTuning(enabled: boolean) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: queryKeys.tuning, queryFn: tuningService.get, enabled, retry: false, staleTime: 30_000 })
  const accept = (snapshot: TuningSnapshot) => {
    client.setQueryData(queryKeys.tuning, snapshot)
    void client.invalidateQueries({ predicate: query => query.queryKey[0] !== queryKeys.tuning[0] })
  }
  const apply = useMutation({ mutationFn: (profile: TuningProfile) => tuningService.apply(profile), onSuccess: accept })
  const stage = useMutation({ mutationFn: (profile: TuningProfile) => tuningService.import(profile), onSuccess: snapshot => client.setQueryData(queryKeys.tuning, snapshot) })
  const regenerate = useMutation({ mutationFn: tuningService.regenerate, retry: false, onSuccess: snapshot => { client.clear(); client.setQueryData(queryKeys.tuning, snapshot) } })
  return { snapshot: query.data, apply: apply.mutateAsync, stage: stage.mutateAsync, regenerate: regenerate.mutateAsync, pending: apply.isPending || stage.isPending || regenerate.isPending }
}
