import { apiClient } from '@/lib/api-client'
import type { Fleet } from '@/lib/types/fleet'

export interface SurveyOptions {
  range: number
  durationMs: number
  worldTime: number
  scale: number
  outcome?: string
  sensorBusy: boolean
  inTransit: boolean
  survey: { bodyId: string; departMs: number; arriveMs: number; invalidReason?: string } | null
  targets: { bodyId: string; eligible: boolean; reason: string }[]
}

export const discoveryService = {
  async surveyOptions(fleetId: string): Promise<SurveyOptions> {
    return (await apiClient.get<SurveyOptions>(`/v1/fleets/${fleetId}/survey`)).data
  },
  async survey(fleetId: string, bodyId: string): Promise<Fleet> {
    return (await apiClient.post<Fleet>(`/v1/fleets/${fleetId}/survey`, { bodyId })).data
  },
  async name(systemId: string, bodyId: string, name: string): Promise<void> {
    await apiClient.post(`/v1/systems/${systemId}/bodies/${bodyId}/name`, { name, confirmed: true })
  },
}
