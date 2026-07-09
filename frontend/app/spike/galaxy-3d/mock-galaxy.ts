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
  homeId: string // the "you are here" start node (nearest the disk centre)
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
  const THIN = 70 // z half-thickness (kept thin so the disk reads as a plane)

  const gauss = () => (rng() + rng() + rng() - 1.5) / 1.5 // ~N(0,1)-ish

  // Regional blobs are *density/character fields*, not node clumps: star-rich and
  // normal centres attract; anywhere their combined influence is weak reads as a
  // dead void. (No 'dead' blobs — dead zones are the absence of the others.)
  const blobs: Blob[] = []
  const blobPlan: Array<[Region, number, number]> = [
    ['star_rich', 4, 3.2], // [region, howMany, weight]
    ['normal', 5, 1.5],
  ]
  for (const [region, howMany, weight] of blobPlan) {
    for (let k = 0; k < howMany; k++) {
      const ang = rng() * Math.PI * 2
      const rad = Math.sqrt(rng()) * R * 0.8
      blobs.push({
        x: Math.cos(ang) * rad,
        y: Math.sin(ang) * rad,
        spread: region === 'star_rich' ? 58 + rng() * 32 : 140 + rng() * 70,
        region,
        weight: weight * (0.75 + rng() * 0.5),
      })
    }
  }

  // Strongest field at a point decides its region; a weak field → dead void.
  const DEAD_BELOW = 0.5
  const regionAt = (x: number, y: number): Region => {
    let best = 0
    let region: Region = 'dead'
    for (const b of blobs) {
      const inf = b.weight * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * b.spread * b.spread))
      if (inf > best) {
        best = inf
        region = b.region
      }
    }
    return best < DEAD_BELOW ? 'dead' : region
  }

  // Poisson-disc-ish spacing: every system keeps a minimum distance from its
  // neighbours (denser in star-rich, sparser in dead) so nodes never overlap into
  // an unreadable blob — the core fix for "too dense here, too sparse there".
  // Wide gap contrast is what makes clusters read as clusters and voids as voids:
  // tight knots in star-rich, sprawling emptiness in dead.
  const minGapFor = (r: Region) => (r === 'star_rich' ? 20 : r === 'normal' ? 44 : 88)
  const systems: MockSystem[] = []
  let attempts = 0
  while (systems.length < count && attempts < count * 80) {
    attempts++
    const ang = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * R
    const x = Math.cos(ang) * rad
    const y = Math.sin(ang) * rad
    const region = regionAt(x, y)
    const gap = minGapFor(region)
    let ok = true
    for (const s of systems) {
      if ((s.x - x) ** 2 + (s.y - y) ** 2 < gap * gap) {
        ok = false
        break
      }
    }
    if (!ok) continue
    const val =
      region === 'star_rich' ? 1.8 + rng() * 1.4 : region === 'dead' ? 0.6 + rng() * 0.5 : 1 + rng() * 1.1
    systems.push({
      id: `sys-${systems.length}`,
      x,
      y,
      z: gauss() * THIN,
      name: makeName(rng),
      region,
      val,
      discovered: false, // set below
    })
  }

  // Barrier seam: a thin chain across the disk, held clear of nearby systems so it
  // reads as a distinct choke.
  const seamAng = rng() * Math.PI
  const seamCount = 16
  for (let s = 0; s < seamCount; s++) {
    const t = (s / (seamCount - 1) - 0.5) * 2 * R * 0.9
    const jitter = gauss() * 18
    const x = Math.cos(seamAng) * t - Math.sin(seamAng) * jitter
    const y = Math.sin(seamAng) * t + Math.cos(seamAng) * jitter
    let ok = true
    for (const sys of systems) {
      if ((sys.x - x) ** 2 + (sys.y - y) ** 2 < 30 * 30) {
        ok = false
        break
      }
    }
    if (!ok) continue
    systems.push({
      id: `sys-b${s}`,
      x,
      y,
      z: gauss() * THIN,
      name: makeName(rng),
      region: 'barrier',
      val: 0.9 + rng() * 0.5,
      discovered: false,
    })
  }

  // --- lanes via the relative-neighbourhood graph -----------------------------
  // Edge (a,b) is kept iff no third system c lies in their "lune" — i.e. no c is
  // closer to BOTH a and b than they are to each other. This yields a clean,
  // road-like network with few crossings (unlike k-NN's dense triangulation), and
  // because the RNG contains the Euclidean MST it is connected by construction.
  const lanes: MockLane[] = []
  const seen = new Set<string>()
  const n = systems.length
  for (let i = 0; i < n; i++) {
    const a = systems[i]
    for (let j = i + 1; j < n; j++) {
      const b = systems[j]
      const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
      let blocked = false
      for (let k = 0; k < n; k++) {
        if (k === i || k === j) continue
        const c = systems[k]
        const da2 = (a.x - c.x) ** 2 + (a.y - c.y) ** 2 + (a.z - c.z) ** 2
        if (da2 >= d2) continue
        const db2 = (b.x - c.x) ** 2 + (b.y - c.y) ** 2 + (b.z - c.z) ** 2
        if (db2 < d2) {
          blocked = true
          break
        }
      }
      if (blocked) continue
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (seen.has(key)) continue
      seen.add(key)
      lanes.push({ source: a.id, target: b.id })
    }
  }

  // --- connectivity safety net ------------------------------------------------
  // The RNG is already connected by construction; this is a cheap belt-and-braces
  // pass (adds 0 edges in practice) that would bridge any islanded component to its
  // nearest node elsewhere, so movement never hits an unreachable system.
  {
    const parent = new Map<string, string>(systems.map((s) => [s.id, s.id]))
    const find = (x: string): string => {
      while (parent.get(x) !== x) {
        parent.set(x, parent.get(parent.get(x)!)!) // path halving
        x = parent.get(x)!
      }
      return x
    }
    const union = (a: string, b: string) => parent.set(find(a), find(b))
    for (const l of lanes) union(l.source, l.target)

    const components = () => {
      const g = new Map<string, MockSystem[]>()
      for (const s of systems) {
        const r = find(s.id)
        ;(g.get(r) ?? g.set(r, []).get(r)!).push(s)
      }
      return [...g.values()]
    }

    let comps = components()
    while (comps.length > 1) {
      comps.sort((a, b) => a.length - b.length)
      const c0 = comps[0]
      const inC0 = new Set(c0.map((s) => s.id))
      let best: { a: MockSystem; b: MockSystem; d: number } | null = null
      for (const a of c0) {
        for (const b of systems) {
          if (inC0.has(b.id)) continue
          const d = (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2
          if (!best || d < best.d) best = { a, b, d }
        }
      }
      if (!best) break
      const { a, b } = best
      const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`
      if (!seen.has(key)) {
        seen.add(key)
        lanes.push({ source: a.id, target: b.id })
      }
      union(a.id, b.id)
      comps = components()
    }
  }

  // --- spawn: home is a FRONTIER-EDGE system ----------------------------------
  // New Corporations spawn at the fresh rim (vision.md / lore.md). At t=0 the whole
  // star map is visible (telescope), but only *home* is charted — you know home's
  // onward subspace lanes and nothing else's until you travel there.
  const degree = new Map<string, number>()
  for (const s of systems) degree.set(s.id, 0)
  for (const l of lanes) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1)
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1)
  }
  let home = systems[0]
  let homeScore = -Infinity
  for (const s of systems) {
    // outer rim, at least two lanes (so the first direction is a real choice), not a barrier
    if (s.region === 'barrier' || (degree.get(s.id) ?? 0) < 2) continue
    const rad = s.x ** 2 + s.y ** 2
    if (rad > homeScore) {
      homeScore = rad
      home = s
    }
  }
  for (const s of systems) s.discovered = false // 'discovered' now means *explored* (visited)
  home.discovered = true

  return { systems, lanes, homeId: home.id }
}
