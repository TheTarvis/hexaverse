// Corporation & spawn types (spec #0009). The Corporation is the player entity —
// the auth-account-linked lineage of an uploaded mind; every fleet is a copy of it
// in a hull.
import type { Fleet } from './fleet'
import type { Region, Skeleton } from './galaxy'

export interface Corporation {
  id: string
  accountId: string
  name: string
  createdAt: number // worldMillis
  diedAt?: number // worldMillis; absent while the lineage lives
}

export interface SpawnRequest {
  name: string
}

// The home system a wake returns — the graph-tier record (no fog `tier`; the wake
// itself grants Explored). Shape of the backend's galaxy.System.
export interface HomeSystem {
  id: string
  name: string
  region: Region
  coords: { x: number; y: number; z: number }
  skeleton: Skeleton
}

// POST /v1/corporations response: the new (or existing, on an idempotent re-call)
// corporation, its one hull, and the frontier system it woke in.
export interface SpawnResult {
  corporation: Corporation
  fleet: Fleet
  homeSystem: HomeSystem
  worldTime: number
}
