import { fleetLabel } from './fleet-label'
import type { Fleet } from './types/fleet'
import type { SpaceBody, SystemSpace } from './types/system-space'
import type { ObjectSearchEntry } from '@/components/space/ObjectSearch'

export function localCommandFleets(fleets: readonly Fleet[], systemId: string): Fleet[] {
  return fleets.filter(fleet => fleet.own && fleet.systemId === systemId && !fleet.jump && !!fleet.position)
}

/** Existing burns can be retargeted; another stationary movement action cannot. */
export function travelCommandFleets(fleets: readonly Fleet[], systemId: string): Fleet[] {
  return localCommandFleets(fleets, systemId).filter(fleet => !fleet.activeActionId || fleet.state.Mode === 0)
}

/** Only disclosed deposits establish the resource role; physical kind is independent. */
export function resourceHost(body: SpaceBody): boolean {
  return body.type !== 'station' && !!body.resources?.some(resource => resource.richness > 0)
}

export function attachedToHost(fleet: Fleet, hostId: string): boolean {
  return fleet.attachedTo === hostId || fleet.attachedTo?.split('#')[0] === hostId
}

export function miningFleet(fleet: Fleet, host: SpaceBody, systemId: string): boolean {
  return localCommandFleets([fleet], systemId).length === 1 && resourceHost(host)
    && !fleet.activeActionId && attachedToHost(fleet, host.id) && fleet.state.Mode === 1
    && Number.isFinite(fleet.roster?.freeHold) && (fleet.roster?.freeHold ?? 0) > 0
    && Number.isFinite(fleet.roster?.miningRate) && (fleet.roster?.miningRate ?? 0) > 0
}

export function fleetSearchEntry(fleet: Fleet): ObjectSearchEntry {
  return { id: fleet.id, name: fleetLabel(fleet), kind: 'fleet', category: 'owned', subtitle: `Owned fleet · ${fleet.roster?.ships.length ?? 'Unknown'} ships` }
}

export function bodySearchEntry(body: SpaceBody): ObjectSearchEntry {
  return { id: body.id, name: body.name ?? body.catalogueRef ?? body.id, kind: body.type,
    resourceSite: resourceHost(body), resources: body.resources?.map(resource => resource.kind),
    subtitle: [body.type.replaceAll('_', ' '), body.catalogueRef, ...(body.resources ?? []).map(resource => resource.kind)].filter(Boolean).join(' · ') }
}

export function travelTargets(interior: SystemSpace): ObjectSearchEntry[] {
  return [...interior.features.filter(body => body.type !== 'star').map(bodySearchEntry),
    ...interior.laneGates.map(gate => ({ id: gate.id, name: gate.name ?? gate.catalogueRef ?? gate.id, kind: 'gate', subtitle: 'Lane gate' }))]
}
