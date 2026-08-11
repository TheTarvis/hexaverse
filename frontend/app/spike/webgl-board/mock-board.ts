// SPIKE (throwaway) — the render model both boards draw.
//
// Adapts the existing /spike/hex-board mock generator into a flat list of
// orbiting bodies plus one own fleet, so the SVG board and the WebGL board can
// be handed IDENTICAL content. That is what makes the comparison fair: same
// layout math (lib/hex/pixel), same body set, same fog bands — only the renderer
// changes.
//
// Orbits follow the production law in spirit: a body walks the hexes of its ring
// (lib/hex ringHexes) and the picture interpolates between them (#0007
// "quantize the simulation, interpolate the picture"). Period rises with ring so
// the inner system visibly turns while the rim sits nearly still.

import { ringHexes, ringOf, type Hex } from '@/lib/hex'
import { lerpPixel, type Point } from '@/lib/hex/pixel'
import { generateMockSystem, type BodyType, type Character } from '../hex-board/mock-system'

export type FogBand = 'visible' | 'remembered' | 'astronomical'

export interface SpikeBody {
  id: string
  type: BodyType
  name: string
  ring: number
  angle0: number // ring-position index at the world epoch
  period: number // world-ms for one revolution (0 = fixed)
  dir: 1 | -1
  drawRadius: number // world units (HEX_SIZE = 34)
  band: FogBand
  seed: number // per-body surface-noise seed
}

export interface SpikeFleet {
  id: string
  hex: Hex // where it sits when idle
  burning: boolean
  headingDeg: number
}

export interface SpikeBoard {
  name: string
  character: Character
  starClass: string
  radius: number
  innerMaxRing: number
  midMaxRing: number
  bodies: SpikeBody[]
  fleet: SpikeFleet
  sensorRadius: number
}

// How big each body family draws, in world units. HEX_SIZE is 34, so a rocky
// planet at 11 sits comfortably inside its hex and a gas giant at 20 overflows
// it slightly — bodies are objects in space, not tile contents.
const DRAW_RADIUS: Record<BodyType, number> = {
  star: 52,
  gas_giant: 20,
  rocky: 11,
  ice: 10,
  moon: 6,
  belt: 3.5,
  anomaly: 12,
  ruin: 9,
}

// Orbital period ∝ ring^1.5 (Kepler's third law, near enough for a spike). The
// base is tuned so ring 3 turns in about 20s at 1× — fast enough to read as
// alive without becoming a fairground ride.
const PERIOD_BASE = 4_000

function periodForRing(ring: number): number {
  if (ring <= 0) return 0
  return PERIOD_BASE * Math.pow(ring, 1.5)
}

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

// Where a body sits at `worldTime`, in SVG/world pixel units. Walks its ring and
// interpolates between the two hexes it is between.
export function bodyPoint(b: SpikeBody, worldTime: number): Point {
  if (b.ring <= 0) return { x: 0, y: 0 }
  const ring = ringHexes(b.ring)
  const n = ring.length
  const advance = b.period > 0 ? (worldTime / b.period) * n : 0
  const idx = b.angle0 + b.dir * advance
  const i0 = Math.floor(idx)
  const frac = idx - i0
  const wrap = (i: number) => ring[((i % n) + n) % n]!
  return lerpPixel(wrap(i0), wrap(i0 + 1), frac)
}

// buildSpikeBoard turns the mock system interior into the render model, and
// assigns the three fog bands so all of them are on screen at once: everything
// inside the fleet's sensor bubble reads LIVE, a seeded slice of the rest reads
// MEMORY, and the remainder is CHARTED (geometry only).
export function buildSpikeBoard(
  seed = 0x51a2c0de,
  character: Character = 'star_rich',
  radius = 16,
): SpikeBoard {
  const sys = generateMockSystem(seed, character, radius)
  const rng = mulberry32(seed ^ 0x9e3779b9)

  const fleetHex: Hex = { q: sys.entry.q, r: sys.entry.r }
  const sensorRadius = 4

  const bodies: SpikeBody[] = []
  for (const tile of sys.tiles) {
    if (!tile.body) continue
    const ring = tile.ring
    const ringSet = ringHexes(ring)
    // The body's epoch index is simply where the generator put it on its ring.
    const angle0 = Math.max(
      0,
      ringSet.findIndex((h) => h.q === tile.q && h.r === tile.r),
    )
    // Distance from the fleet decides the band. hexDistance via ringOf on the
    // difference is not valid, so measure properly through cube distance.
    const d = axialDistance(tile, fleetHex)
    let band: FogBand
    if (d <= sensorRadius) band = 'visible'
    else if (rng() < 0.45) band = 'remembered'
    else band = 'astronomical'

    bodies.push({
      id: tile.body.id,
      type: tile.body.type,
      name: tile.body.name,
      ring,
      angle0,
      period: periodForRing(ring),
      dir: rng() < 0.5 ? -1 : 1,
      drawRadius: DRAW_RADIUS[tile.body.type],
      band: tile.body.type === 'star' ? 'visible' : band,
      seed: rng() * 100,
    })
  }

  return {
    name: sys.name,
    character: sys.character,
    starClass: sys.starClass,
    radius: sys.radius,
    innerMaxRing: Math.floor(radius / 3),
    midMaxRing: Math.floor((radius * 2) / 3),
    bodies,
    fleet: { id: 'own-1', hex: fleetHex, burning: true, headingDeg: 0 },
    sensorRadius,
  }
}

// Axial hex distance (the cube-distance identity) — local so the spike model
// stays free of the production board's imports beyond pure geometry.
export function axialDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2
}

// The ring a hex sits on — re-exported so the renderers agree with lib/hex.
export { ringOf }
