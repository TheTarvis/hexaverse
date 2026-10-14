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

// A Corporation's monotonic subspace knowledge over the always-visible star map
// (spec #0006, replacing the old `discovered` stub). `starVisible` is the free
// baseline every system ships at; the ladder is earned by surveying / travelling.
export type SubspaceTier = 'starVisible' | 'rumored' | 'surveyed' | 'explored'

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
  catalogueRef?: string
  discovery?: import("./system-space").DiscoveryRecord
  region: Region
  // The requester's subspace tier over the free star map (#0006). The star layer
  // (position, region, skeleton) renders regardless of tier.
  tier: SubspaceTier
  skeleton: Skeleton
}

export interface WireLane {
  id: string
  aId: string
  bId: string
  // A deterministic void-crossing stitch rather than an ordinary
  // relative-neighbourhood road: it may be far longer than the lane cap, and it
  // renders faint. Mechanically it behaves exactly like any other lane. Absent
  // on ordinary lanes (the backend omits the field when false).
  bridge?: boolean
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
  catalogueRef?: string
  discovery?: import("./system-space").DiscoveryRecord
  region: Region
  tier: SubspaceTier
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
  // Carried through from the wire so the renderer can draw void-crossing
  // bridges distinctly. Never affects interaction.
  bridge: boolean
}

export interface Galaxy {
  id: string
  seed: number
  bounds: GalaxyBounds
  worldTime: number
  nodes: GalaxyNode[]
  links: GalaxyLink[]
}
