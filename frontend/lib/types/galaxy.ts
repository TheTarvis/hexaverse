// Galaxy domain types (spec #0002).
//
// Two shapes live here:
//  1. The WIRE shape — exactly what `GET /v1/galaxy` and the frozen
//     `/galaxy/start-area.json` static asset return (identical shape).
//  2. The RENDERER shape — what `react-force-graph-3d` consumes. The galaxy
//     service adapts wire -> renderer (flatten `coords` -> x/y/z, map
//     `aId`/`bId` -> `source`/`target`) so the backend stays decoupled from
//     the graph library.

export type Region = 'star_rich' | 'normal' | 'dead' | 'barrier'

export type BodyType = 'rocky' | 'gas_giant' | 'ice' | 'molten' | 'oceanic' | 'barren'

export interface WireBody {
  type: BodyType
  ring: number
}

// The free "astronomical" layer (spec #0002 Decision #7 / #0001 Decision #9):
// star class + major bodies, always visible, never gated by `discovered`.
export interface Skeleton {
  starClass: string
  bodies: WireBody[]
}

export interface WireSystem {
  id: string
  coords: { x: number; y: number; z: number }
  name: string
  region: Region
  discovered: boolean
  skeleton: Skeleton
}

export interface WireLane {
  id: string
  aId: string
  bId: string
}

export interface GalaxyBounds {
  x: [number, number]
  y: [number, number]
  z: [number, number]
}

export interface WireGalaxy {
  id: string
  seed: number
  bounds: GalaxyBounds
  systems: WireSystem[]
  lanes: WireLane[]
  worldTime: number
}

// ---- Renderer shape (react-force-graph-3d) ----

// A system node, pinned to its generated (x,y,z) via fx/fy/fz so orbit reveals
// the real spatial structure rather than a force-solved layout.
export interface GalaxyNode {
  id: string
  name: string
  region: Region
  discovered: boolean
  skeleton: Skeleton
  x: number
  y: number
  z: number
  fx: number
  fy: number
  fz: number
}

export interface GalaxyLink {
  id: string
  source: string
  target: string
}

export interface Galaxy {
  id: string
  seed: number
  bounds: GalaxyBounds
  worldTime: number
  nodes: GalaxyNode[]
  links: GalaxyLink[]
}
