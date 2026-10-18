import type { Fleet } from './types/fleet'

/** Preserve the served name; missing/blank legacy names have an explicit stable fallback. */
export function fleetLabel(fleet: Pick<Fleet, 'id' | 'name'>): string {
  return fleet.name?.trim() || `Fleet ${fleet.id.slice(-8)}`
}
