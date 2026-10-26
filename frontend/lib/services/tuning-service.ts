import { apiClient } from '@/lib/api-client'
import type { TuningProfile, TuningSnapshot } from '@/lib/types/tuning'

const path = '/v1/dev/tuning'
export const tuningService = {
  async get() { return (await apiClient.get<TuningSnapshot>(path)).data },
  async apply(profile: TuningProfile) { return (await apiClient.put<TuningSnapshot>(path, profile)).data },
  async import(profile: TuningProfile) { return (await apiClient.post<TuningSnapshot>(`${path}/import`, profile)).data },
  async regenerate() { return (await apiClient.post<TuningSnapshot>(`${path}/regenerate`, {})).data },
}
