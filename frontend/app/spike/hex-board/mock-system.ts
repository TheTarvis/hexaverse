// Spike-only mock system-interior generator — stands in for the future
// `/spec system-interior` output so we can eyeball the SVG hex board (see
// docs/plans/hex-board.md) before the real generation/read API exists.
// Deterministic (seeded) so the layout is stable across reloads. NOT production code.
//
// Model (docs/plans/hex-board.md): star at hex (0,0); distance-from-center =
// orbital distance; contents = radial gradient + noise. BODIES are the anchor
// (star / planets / belts / moons / anomalies) — resource tiles hang off them,
// they are not scattered loose. The system's graph-tier CHARACTER dials the
// generator (star_rich → dense; dead → lonely).

// --- axial hex coords ---------------------------------------------------------
export interface Axial {
  q: number
  r: number
}

export function hexDistance(a: Axial, b: Axial): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2
}

export function ringOf(a: Axial): number {
  return hexDistance(a, { q: 0, r: 0 })
}

// --- domain types -------------------------------------------------------------
export type Band = 'core' | 'inner' | 'mid' | 'outer'
export type BodyType = 'star' | 'rocky' | 'gas_giant' | 'ice' | 'belt' | 'moon' | 'anomaly' | 'ruin'
export type ResourceKind = 'metals' | 'volatiles' | 'water' | 'organics' | 'research' | 'exotic'
export type Hazard = 'radiation' | 'nebula' | 'gravity_well' | 'debris'
export type Character = 'star_rich' | 'normal' | 'dead' | 'barrier'

export interface Resource {
  kind: ResourceKind
  richness: number // 0..1
}

export interface Body {
  id: string
  type: BodyType
  name: string
  resources: Resource[]
}

export interface Tile {
  q: number
  r: number
  ring: number
  band: Band
  body?: Body
  hazard?: Hazard
}

export interface SystemInterior {
  name: string
  character: Character
  starClass: string
  radius: number
  entry: Axial // where you arrive from the inbound lane (gate ring) = laneExits[0]
  laneExits: Axial[] // gate tiles (inner edge of outer band) where lanes leave (graph↔board seam)
  scanRadius: number // demo: ambient/scan vision bubble around entry
  tiles: Tile[]
}

// Hash an arbitrary id string → a stable 32-bit seed, so a galaxy system's id
// deterministically picks its interior (same system → same board). FNV-1a.
export function hashSeed(str: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// --- seeded PRNG (mulberry32) -------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// --- names --------------------------------------------------------------------
const SYLL_A = ['ax', 've', 'kor', 'zan', 'lyr', 'tor', 'nex', 'qui', 'dra', 'sol', 'vel', 'orn', 'cy', 'the', 'my']
const SYLL_B = ['ion', 'ara', 'us', 'eth', 'ix', 'oon', 'ess', 'ur', 'alis', 'or', 'ea', 'yn', 'ave', 'is']
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
function makeName(rng: () => number): string {
  const a = SYLL_A[Math.floor(rng() * SYLL_A.length)]
  const b = SYLL_B[Math.floor(rng() * SYLL_B.length)]
  return a.charAt(0).toUpperCase() + a.slice(1) + b
}

const STAR_CLASSES = ['O', 'B', 'A', 'F', 'G', 'K', 'M']

function bandOf(ring: number, radius: number): Band {
  if (ring === 0) return 'core'
  if (ring <= Math.floor(radius / 3)) return 'inner'
  if (ring <= Math.floor((radius * 2) / 3)) return 'mid'
  return 'outer'
}

// How many of each thing to roll, per graph-tier character (the "dial").
const DIAL: Record<Character, { planets: [number, number]; belts: number; specials: number; rich: number }> = {
  star_rich: { planets: [6, 8], belts: 2, specials: 2, rich: 1.0 },
  normal: { planets: [3, 5], belts: 1, specials: 1, rich: 0.7 },
  dead: { planets: [1, 2], belts: 0, specials: 0, rich: 0.35 },
  barrier: { planets: [2, 4], belts: 1, specials: 1, rich: 0.6 },
}

function res(kind: ResourceKind, richness: number): Resource {
  return { kind, richness: Math.max(0, Math.min(1, richness)) }
}

// Resource profile for a planet by band (the radial gradient made concrete).
function planetProfile(band: Band, rng: () => number, rich: number): { type: BodyType; resources: Resource[] } {
  if (band === 'inner') {
    return { type: 'rocky', resources: [res('metals', (0.55 + rng() * 0.45) * rich)] }
  }
  if (band === 'mid') {
    // goldilocks: habitable / organics, some metals
    return {
      type: 'rocky',
      resources: [res('organics', (0.4 + rng() * 0.5) * rich), res('metals', (0.15 + rng() * 0.3) * rich)],
    }
  }
  // outer: gas giant or ice body, volatiles / water
  if (rng() < 0.5) {
    return { type: 'gas_giant', resources: [res('volatiles', (0.5 + rng() * 0.5) * rich)] }
  }
  return { type: 'ice', resources: [res('water', (0.45 + rng() * 0.45) * rich), res('volatiles', (0.2 + rng() * 0.3) * rich)] }
}

export function generateMockSystem(seed = 0x51a2c0de, character: Character = 'star_rich', radius = 16): SystemInterior {
  const rng = mulberry32(seed)
  const dial = DIAL[character]
  const sysName = makeName(rng)

  // Build the full board of tiles.
  const tiles: Tile[] = []
  const index = new Map<string, Tile>()
  const key = (q: number, r: number) => `${q},${r}`
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      const ring = ringOf({ q, r })
      if (ring > radius) continue
      const t: Tile = { q, r, ring, band: bandOf(ring, radius) }
      tiles.push(t)
      index.set(key(q, r), t)
    }
  }

  // Bucket free tiles by band for placement.
  const byBand: Record<Band, Tile[]> = { core: [], inner: [], mid: [], outer: [] }
  for (const t of tiles) byBand[t.band].push(t)
  const takeFrom = (band: Band): Tile | undefined => {
    const pool = byBand[band].filter((t) => !t.body)
    if (pool.length === 0) return undefined
    return pool[Math.floor(rng() * pool.length)]
  }

  // 1) Star at the center.
  const core = index.get(key(0, 0))!
  const starClass = STAR_CLASSES[Math.floor(rng() * STAR_CLASSES.length)]
  core.body = { id: 'star', type: 'star', name: `${sysName} (${starClass})`, resources: [res('exotic', 0.9)] }

  // 2) Planets, weighted toward inner/mid (things thin out in the dark).
  const nPlanets = dial.planets[0] + Math.floor(rng() * (dial.planets[1] - dial.planets[0] + 1))
  let planetNo = 0
  for (let i = 0; i < nPlanets; i++) {
    const roll = rng()
    const band: Band = roll < 0.35 ? 'inner' : roll < 0.75 ? 'mid' : 'outer'
    const tile = takeFrom(band) ?? takeFrom('mid') ?? takeFrom('inner') ?? takeFrom('outer')
    if (!tile) continue
    const { type, resources } = planetProfile(tile.band, rng, dial.rich)
    planetNo++
    tile.body = { id: `planet-${planetNo}`, type, name: `${sysName} ${ROMAN[planetNo - 1] ?? planetNo}`, resources }

    // gas giants get a moon on an adjacent tile
    if (type === 'gas_giant' && rng() < 0.7) {
      const dirs = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
      ]
      const [dq, dr] = dirs[Math.floor(rng() * dirs.length)]
      const m = index.get(key(tile.q + dq, tile.r + dr))
      if (m && !m.body && m.ring <= radius) {
        m.body = { id: `moon-${planetNo}`, type: 'moon', name: `${tile.body.name}-a`, resources: [res('water', 0.3 * dial.rich)] }
      }
    }
  }

  // 3) Asteroid belts — a ring arc of `belt` bodies (metals inner, ice outer).
  for (let b = 0; b < dial.belts; b++) {
    const ring = 2 + Math.floor(rng() * (radius - 2)) // ring 2..radius-1
    const arc = tiles.filter((t) => t.ring === ring && !t.body)
    const kind: ResourceKind = ring <= Math.floor(radius / 2) ? 'metals' : 'water'
    // take a contiguous-ish subset (~60% of the ring)
    const keep = Math.max(3, Math.floor(arc.length * 0.6))
    for (let i = 0; i < arc.length && i < keep; i++) {
      const t = arc[i]
      t.body = { id: `belt-${ring}-${i}`, type: 'belt', name: `${sysName} Belt`, resources: [res(kind, (0.4 + rng() * 0.5) * dial.rich)] }
    }
  }

  // 4) Specials — anomalies / ruins in the goldilocks mid band.
  for (let s = 0; s < dial.specials; s++) {
    const tile = takeFrom('mid') ?? takeFrom('outer')
    if (!tile) continue
    const isRuin = rng() < 0.5
    tile.body = isRuin
      ? { id: `ruin-${s}`, type: 'ruin', name: `Derelict ${makeName(rng)}`, resources: [res('research', 0.6 + rng() * 0.4)] }
      : { id: `anomaly-${s}`, type: 'anomaly', name: `Anomaly ${makeName(rng)}`, resources: [res('exotic', 0.6 + rng() * 0.4)] }
  }

  // 5) Hazards — radiation near the star, nebula/debris in the dark; a gravity
  //    well ringing the core. Cheap terrain meaning; cuts scan (per fog doc).
  for (const t of tiles) {
    if (t.band === 'inner' && rng() < 0.18) t.hazard = 'radiation'
    else if (t.band === 'outer' && rng() < (character === 'barrier' ? 0.4 : 0.14)) t.hazard = 'nebula'
    else if (t.ring === 1 && rng() < 0.25) t.hazard = 'gravity_well'
    if (t.body?.type === 'belt' && !t.hazard && rng() < 0.3) t.hazard = 'debris'
  }

  // Lane exits: gate tiles where charted lanes leave the system (the graph↔board
  // seam). They sit on the gate ring — the inner edge of the outer band, 3 rings
  // in from the rim (2026-07-14 decision; mirrors board.GateRing) — so a 3-ring
  // shell of outer dark sits outside them. You arrive via one (entry = laneExits[0])
  // and can depart via any. Spread ~evenly so they read as distinct directions.
  const gateRingIdx = Math.max(1, radius - 3)
  const mouthRing = tiles
    .filter((t) => t.ring === gateRingIdx)
    .sort((a, b) => Math.atan2(a.r, a.q + a.r / 2) - Math.atan2(b.r, b.q + b.r / 2))
  const nLanes = 2 + Math.floor(rng() * 3) // 2..4 lanes
  const offset = Math.floor(rng() * mouthRing.length)
  const laneExits: Axial[] = []
  for (let i = 0; i < nLanes; i++) {
    const t = mouthRing[(offset + Math.floor((i * mouthRing.length) / nLanes)) % mouthRing.length]
    laneExits.push({ q: t.q, r: t.r })
  }

  return {
    name: sysName,
    character,
    starClass,
    radius,
    entry: laneExits[0],
    laneExits,
    scanRadius: 3,
    tiles,
  }
}
