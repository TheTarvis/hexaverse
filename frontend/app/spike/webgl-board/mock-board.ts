// SPIKE — the tuning bench's fixture: a SystemBoard + Fleet[] shaped exactly
// like the production reads, so the bench packs it through the SAME pure pack
// functions the live board uses (createPackedScene, packFleetInstance,
// createFramePacker). Kept permanently as the WebGL-only bench's data source
// (port-board-to-webgl-renderer, Migration Plan preamble).
//
// Orbits follow the production law: lib/hex `Orbit` records evaluated by
// orbState/glyph-geometry (#0007 "quantize the simulation, interpolate the
// picture"). Period rises with ring so the inner system visibly turns while
// the rim sits nearly still.

import { ringCells, schedule as boardSchedule, type Cell } from '@/lib/board'
import type { BoardFeature, SystemBoard } from '@/lib/types/system-board'
import type { Fleet } from '@/lib/types/fleet'
import { generateMockSystem, type Character } from '../hex-board/mock-system'

export type FogBand = 'visible' | 'remembered' | 'astronomical'

// Orbital period ∝ ring^1.5 (Kepler's third law, near enough for a bench).
// The base is tuned so ring 3 turns in about 20s at 1× — fast enough to read
// as alive without becoming a fairground ride.
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

// Ring distance on the polar lattice — the bench only needs "how far out from
// the fleet's ring", which is what decides its fog band below. Kept local so
// the fixture stays free of the production board beyond pure geometry.
// The demo sensor bubble's reach, in RINGS. Two, not the hex era's four: the
// band now measures radial separation, and a four-ring bubble swallowed nine of
// the sixteen rings, leaving nothing on the remembered/astronomical bands —
// the opposite of what the bench exists to show. Exported so the test asserts
// against the same number the fixture uses.
export const DEMO_SENSOR_RINGS = 2

export function ringDistance(a: Cell, b: Cell): number {
  return Math.abs(a.ring - b.ring)
}

export interface MockSystemFixture {
  board: SystemBoard
  fleets: Fleet[]
  name: string
}

// buildMockSystemBoard assigns the three fog bands so all of them are on
// screen at once: everything inside the demo sensor bubble reads LIVE, a
// seeded slice of the rest reads MEMORY, and the remainder is CHARTED
// (geometry only) — the bench's whole point.
export function buildMockSystemBoard(
  seed = 0x51a2c0de,
  character: Character = 'star_rich',
  radius = 16,
): MockSystemFixture {
  const sys = generateMockSystem(seed, character, radius)
  const rng = mulberry32(seed ^ 0x9e3779b9)

  const sched = boardSchedule(radius)
  // The mock system generator still speaks its own (q,r) grid; the bench maps
  // each generated tile onto the polar ring it was generated for, at a slot
  // derived from its index around that ring.
  const fleetCell: Cell = { ring: Math.min(radius, 6), slot: 0 }
  const sensorRadius = DEMO_SENSOR_RINGS

  const features: BoardFeature[] = []
  for (const tile of sys.tiles) {
    if (!tile.body) continue
    const ring = tile.ring
    if (tile.body.type === 'star') {
      // The star is always live — it is the scene light, never fogged out.
      features.push({
        id: tile.body.id,
        type: 'star',
        fixed: true,
        footprint: [{ ring: 0, slot: 0 }],
        band: 'visible',
        live: true,
      })
      continue
    }
    const ringSet = ringCells(ring, sched)
    // The generated tile's position around its ring, folded into the polar
    // ring's slot count.
    const angle0 = ringSet.length > 0 ? Math.abs(tile.q * 7 + tile.r * 13) % ringSet.length : 0
    const cell: Cell = { ring, slot: angle0 }
    const d = ringDistance(cell, fleetCell)
    let band: FogBand
    if (d <= sensorRadius) band = 'visible'
    else if (rng() < 0.45) band = 'remembered'
    else band = 'astronomical'

    const mineable =
      band !== 'astronomical' && (tile.body.type === 'rocky' || tile.body.type === 'belt' || tile.body.type === 'ice')
    features.push({
      id: tile.body.id,
      type: tile.body.type,
      orbit: { ring, angle0, period: periodForRing(ring), dir: rng() < 0.5 ? -1 : 1 },
      footprint: [cell],
      band,
      live: band === 'visible',
      ...(mineable ? { resources: [{ kind: 'metals', richness: 1 + Math.floor(rng() * 4) }] } : {}),
      ...(band === 'remembered' ? { asOf: 0 } : {}),
    })
  }

  const rim = ringCells(radius, sched)
  const board: SystemBoard = {
    systemId: 'mock-system',
    radius,
    character: sys.character,
    starClass: sys.starClass,
    features,
    laneGates: [
      { destSystemId: 'mock-neighbour-a', cell: rim[0]! },
      { destSystemId: 'mock-neighbour-b', cell: rim[Math.floor(rim.length / 2)]! },
    ],
    worldTime: 0,
  }

  // An inward spiral from the entry cell — long enough that the bench shows
  // the plume/trail for minutes at 1×, and it exercises the arc path the polar
  // lattice actually flies (a straight westward run no longer exists).
  const burnPath: Cell[] = []
  for (let i = 0; i <= 12; i++) {
    const ring = Math.max(1, fleetCell.ring - Math.floor(i / 3))
    const slots = ringCells(ring, sched).length
    burnPath.push({ ring, slot: (fleetCell.slot + i) % slots })
  }

  const roster = (ships: number) => ({
    ships: Array.from({ length: ships }, () => ({ class: 'corvette' })),
    cargo: null,
    cargoCapacity: ships * 100,
    freeHold: ships * 100,
    miningRate: ships * 0.001,
  })

  const fleets: Fleet[] = [
    {
      id: 'own-burner',
      corporationId: 'mock-corp',
      systemId: board.systemId,
      state: {
        mode: 'burn',
        burn: {
          path: burnPath,
          startTime: 0,
          arriveTime: burnPath.length * 60_000,
          target: { cell: burnPath[burnPath.length - 1]! },
        },
      },
      position: fleetCell,
      own: true,
      roster: roster(2),
      worldTime: 0,
    },
    {
      id: 'own-flotilla',
      corporationId: 'mock-corp',
      systemId: board.systemId,
      state: {
        mode: 'coast',
        coast: { ring: Math.max(3, Math.floor(radius / 3)), angle0: 2, period: 240_000, dir: 1 },
      },
      position: fleetCell,
      own: true,
      roster: roster(4),
      worldTime: 0,
    },
    {
      id: 'foreign-contact',
      corporationId: 'rival-corp',
      systemId: board.systemId,
      state: {
        mode: 'coast',
        coast: { ring: Math.max(5, Math.floor(radius / 2)), angle0: 9, period: 300_000, dir: -1 },
      },
      position: fleetCell,
      own: false,
      worldTime: 0,
    },
  ]

  return { board, fleets, name: sys.name }
}
