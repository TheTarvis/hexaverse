// Spike-only mock galaxy generator — stands in for spec #0001's output so we can
// eyeball the 2D render (spec #0002) before the real generation/read API exists.
// Deterministic (seeded) so the layout is stable across reloads. NOT production code.

export type Region = 'star_rich' | 'normal' | 'dead' | 'barrier'

export interface MockSystem {
  id: string
  x: number
  y: number
  z: number
  name: string
  region: Region
  val: number // relative importance → node size
  discovered: boolean
}

export interface MockLane {
  source: string
  target: string
}

export interface MockGalaxy {
  systems: MockSystem[]
  lanes: MockLane[]
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

// --- name generation ----------------------------------------------------------
const SYLL_A = ['ax', 've', 'kor', 'zan', 'lyr', 'tor', 'nex', 'qui', 'dra', 'sol', 'vel', 'orn', 'cy', 'the', 'my']
const SYLL_B = ['ion', 'ara', 'us', 'eth', 'ix', 'oon', 'ess', 'ur', 'alis', 'or', 'ea', 'yn', 'ave', 'is']
function makeName(rng: () => number): string {
  const a = SYLL_A[Math.floor(rng() * SYLL_A.length)]
  const b = SYLL_B[Math.floor(rng() * SYLL_B.length)]
  const n = a.charAt(0).toUpperCase() + a.slice(1) + b
  // a minority carry a catalog-style designation
  return rng() < 0.25 ? `${n} ${Math.floor(rng() * 900 + 100)}` : n
}

interface Blob {
  x: number
  y: number
  spread: number
  region: Region
  weight: number
}

/**
 * Generate a flattened-disk galaxy with regional character:
 * star-rich clusters (dense, gold), a couple of dead voids (sparse, dim),
 * and a barrier seam (thin magenta chain that acts as a choke).
 */
export function generateMockGalaxy(seed = 0x1a2b3c4d, count = 260): MockGalaxy {
  const rng = mulberry32(seed)
  const R = 520 // disk radius
  const THIN = 90 // z half-thickness

  // Regional blobs seeded around the disk.
  const blobs: Blob[] = []
  const blobPlan: Array<[Region, number, number]> = [
    ['star_rich', 4, 3], // [region, howMany, weight]
    ['normal', 5, 2],
    ['dead', 2, 1],
  ]
  for (const [region, howMany, weight] of blobPlan) {
    for (let k = 0; k < howMany; k++) {
      const ang = rng() * Math.PI * 2
      const rad = Math.sqrt(rng()) * R * 0.82
      blobs.push({
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        spread: region === 'star_rich' ? 70 + rng() * 40 : 110 + rng() * 70,
        region,
        weight: weight * (0.7 + rng() * 0.6),
      })
    }
  }
  const totalWeight = blobs.reduce((s, b) => s + b.weight, 0)

  const systems: MockSystem[] = []
  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5 // ~N(0,1)-ish

  for (let i = 0; i < count; i++) {
    // pick a blob by weight
    let r = rng() * totalWeight
    let blob = blobs[0]
    for (const b of blobs) {
      r -= b.weight
      if (r <= 0) {
        blob = b
        break
      }
    }
    const x = blob.x + gauss() * blob.spread
    const y = blob.y + gauss() * blob.spread
    const z = gauss() * THIN
    const region = blob.region
    const val =
      region === 'star_rich' ? 2.2 + rng() * 2.5 : region === 'dead' ? 0.6 + rng() * 0.5 : 1 + rng() * 1.4
    systems.push({
      id: `sys-${i}`,
      x,
      y,
      z,
      name: makeName(rng),
      region,
      val,
      discovered: false, // set below
    })
  }

  // Barrier seam: a thin chain of barrier systems across the disk — a choke.
  const seamAng = rng() * Math.PI
  const seamCount = 16
  for (let s = 0; s < seamCount; s++) {
    const t = (s / (seamCount - 1) - 0.5) * 2 * R * 0.9
    const jitter = gauss() * 22
    const x = Math.cos(seamAng) * t - Math.sin(seamAng) * jitter
    const y = Math.sin(seamAng) * t + Math.cos(seamAng) * jitter
    systems.push({
      id: `sys-b${s}`,
      x,
      y,
      z: gauss() * THIN,
      name: makeName(rng),
      region: 'barrier',
      val: 0.9 + rng() * 0.6,
      discovered: false,
    })
  }

  // --- lanes via k-nearest neighbours (2D distance) ---------------------------
  const lanes: MockLane[] = []
  const seen = new Set<string>()
  const K = 3
  for (const a of systems) {
    const near = systems
      .filter((b) => b.id !== a.id)
      .map((b) => ({ b, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .sort((p, q) => p.d - q.d)
      .slice(0, a.region === 'barrier' ? 1 : K) // barriers connect sparsely → choke
    for (const { b } of near) {
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) continue
      seen.add(key)
      lanes.push({ source: a.id, target: b.id })
    }
  }

  // --- fog: everything within a radius of the home system is discovered -------
  // Home = system nearest the disk centre. Demonstrates the dim/undiscovered path.
  let home = systems[0]
  let homeD = Infinity
  for (const s of systems) {
    const d = s.x ** 2 + s.y ** 2
    if (d < homeD) {
      homeD = d
      home = s
    }
  }
  const FOG_R = 300
  for (const s of systems) {
    s.discovered = (s.x - home.x) ** 2 + (s.y - home.y) ** 2 <= FOG_R ** 2
  }
  home.discovered = true

  return { systems, lanes }
}
