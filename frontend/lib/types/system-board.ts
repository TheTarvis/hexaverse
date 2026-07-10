// System-board domain types (spec #0007) — the fogged interior read.
//
// This mirrors the wire shape of `GET /v1/systems/:id` exactly (backend
// system/handler.go `interiorDTO` + system/fog.go `fogFeatureDTO`): the
// astronomical skeleton, the requester's remembered features, and the live
// content inside their sensor union — already fogged server-side (#0006).
//
// Unlike the galaxy read there is no wire→renderer flattening: the board glyph
// layers consume `Hex`/`Orbit` straight from `lib/hex` (the same math the
// backend evaluates authoritatively), so the wire shape IS the renderer shape.
// `lib/services/system-service.ts` is the seam where the requester's fleets
// (a separate fleet-domain read) will fan in on a later slice.

import type { Hex, Orbit } from '@/lib/hex'

// The unified feature family (backend system.FeatureType) — physical/minable
// bodies and hazards alike; hazards just carry an `effects` payload.
export type FeatureType =
  | 'star'
  | 'rocky'
  | 'gas_giant'
  | 'ice'
  | 'belt'
  | 'moon'
  | 'anomaly'
  | 'ruin'
  | 'nebula'
  | 'gravity_well'
  | 'debris'
  | 'radiation'

export type ResourceKind = 'metals' | 'volatiles' | 'water' | 'organics' | 'research' | 'exotic'

// The three visibility bands the fog filter projects into (#0006):
//  - visible       — live truth this instant, inside the sensor union (`live`).
//  - remembered    — a stored observation; geometry keeps orbiting, activity
//                    frozen at `asOf`.
//  - astronomical  — the free layer: geometry + type only, no worth.
export type FogBand = 'visible' | 'remembered' | 'astronomical'

export interface Resource {
  kind: ResourceKind
  richness: number
}

export interface Effects {
  scanMod?: number
  moveMod?: number
  block?: boolean
}

// One fogged feature on the board. Position is exactly one of: `orbit` (orbits
// the star), `parentId` (rides another feature — moons), or `fixed` (the star
// at centre). `footprint` is the feature's epoch tile(s). `resources`/`effects`
// are present only where the requester has earned the detail.
export interface BoardFeature {
  id: string
  type: FeatureType
  orbit?: Orbit
  parentId?: string
  fixed?: boolean
  footprint: Hex[]
  band: FogBand
  live: boolean
  resources?: Resource[]
  effects?: Effects
  // Freshness stamp for a Remembered feature (activity frozen here); absent on
  // Visible/astronomical bands (world-milliseconds).
  asOf?: number
}

// The fogged system interior — exactly what `GET /v1/systems/:id` returns.
export interface SystemBoard {
  systemId: string
  radius: number
  character: string
  starClass: string
  features: BoardFeature[]
  // Server world time at read (world-milliseconds) — the offset source that
  // drives client-side orbit/fleet animation (#0005).
  worldTime: number
}
