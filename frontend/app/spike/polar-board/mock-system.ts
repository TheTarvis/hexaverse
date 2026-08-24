// SPIKE — the polar bench's fixture. Route: /spike/polar-board
//
// Bodies placed directly in (ring, slot) with PolarOrbit records, deliberately
// NOT routed through the hex fixture in ../hex-board/mock-system: the point of
// the bench is to see the polar lattice on its own terms, and borrowing a hex
// body census would smuggle 6N ring sizes back in.
//
// Orbits follow Kepler's third law (period proportional to ring^1.5) so the
// inner system visibly outruns the rim — the thing a uniform-rate hex ring
// walk cannot express, since every hex ring advances one cell per step
// regardless of radius.

import { slotsForRing, type PolarOrbit, type SlotSchedule, DEFAULT_SCHEDULE } from './polar'

export type BodyKind = 'star' | 'rocky' | 'gas_giant' | 'ice' | 'belt' | 'moon'

export interface MockBody {
  id: string
  kind: BodyKind
  name: string
  orbit: PolarOrbit
  // Drawn radius in board pixels. The star occludes; so do the giants.
  size: number
  occludes: boolean
}

export interface MockPolarSystem {
  name: string
  maxRing: number
  bodies: MockBody[]
}

// Period base tuned so ring 3 turns in roughly 20s at 1x — alive without
// becoming a fairground ride (same feel target as the WebGL bench).
const PERIOD_BASE = 4_000

export function periodForRing(ring: number): number {
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

const NAMES = ['Kestrel', 'Vantage', 'Ossuary', 'Tallow', 'Bellwether', 'Cinder', 'Marrow', 'Quill']

// buildMockPolarSystem seeds a star, a handful of planets on distinct rings, a
// belt band, and one moon riding just outside its parent — enough content to
// judge motion against, and enough spread to make a transfer across the board
// interesting.
export function buildMockPolarSystem(
  seed = 0x51a2c0de,
  maxRing = 16,
  sched: SlotSchedule = DEFAULT_SCHEDULE,
): MockPolarSystem {
  const rng = mulberry32(seed)
  const bodies: MockBody[] = []

  bodies.push({
    id: 'star',
    kind: 'star',
    name: 'Primary',
    orbit: { ring: 0, angle0: 0, period: 0, dir: 1 },
    size: 26,
    occludes: true,
  })

  // Planets on distinct rings, spread across the inner and mid bands so both
  // sides of a slot-schedule doubling boundary carry content.
  const planetRings = [2, 4, 6, 9, 12].filter((r) => r <= maxRing)
  planetRings.forEach((ring, i) => {
    const slots = slotsForRing(ring, sched)
    const kind: BodyKind = ring >= 9 ? 'ice' : ring >= 6 ? 'gas_giant' : 'rocky'
    bodies.push({
      id: `planet-${i}`,
      kind,
      name: NAMES[i % NAMES.length],
      orbit: {
        ring,
        angle0: Math.floor(rng() * slots),
        period: periodForRing(ring),
        dir: 1,
      },
      size: kind === 'gas_giant' ? 15 : kind === 'ice' ? 9 : 8,
      occludes: kind === 'gas_giant',
    })
  })

  // A moon riding one ring outside the innermost gas giant, on a much faster
  // orbit — the fixture's stress case for reading motion at small radius.
  const giant = bodies.find((b) => b.kind === 'gas_giant')
  if (giant) {
    const ring = giant.orbit.ring + 1
    bodies.push({
      id: 'moon-0',
      kind: 'moon',
      name: `${giant.name} minor`,
      orbit: {
        ring,
        angle0: Math.floor(rng() * slotsForRing(ring, sched)),
        period: periodForRing(ring) * 0.35,
        dir: 1,
      },
      size: 4,
      occludes: false,
    })
  }

  // A belt: many small rocks sharing one ring, seeded across its slots. On a
  // polar lattice a belt is literally a populated ring, which is the shape it
  // always wanted to be.
  const beltRing = Math.min(maxRing - 3, 14)
  if (beltRing > 0) {
    const slots = slotsForRing(beltRing, sched)
    const count = 18
    for (let i = 0; i < count; i++) {
      bodies.push({
        id: `belt-${i}`,
        kind: 'belt',
        name: 'Belt fragment',
        orbit: {
          ring: beltRing,
          angle0: Math.floor((i / count) * slots + rng() * 2),
          period: periodForRing(beltRing),
          dir: 1,
        },
        size: 2.5,
        occludes: false,
      })
    }
  }

  return { name: `Bench-${(seed >>> 0).toString(16).slice(0, 4)}`, maxRing, bodies }
}
