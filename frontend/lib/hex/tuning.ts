// Client mirror of the ONE tuning knob lib/hex needs from
// backend/common/tuning.go: the world's orbital law. stateAt folds a finished
// burn into the coast orbit the server settles it into, and that orbit's period
// is OrbitPeriod(ring) — the same period a body on that ring has.
//
// This constant MUST match GameTuning.OrbitBasePeriod on the backend. The
// golden (/fixtures/board/cases.json, stateAt cases) records the folded coast's
// period, so a backend retune breaks fixtures.test.ts here until this value
// follows — the drift is loud, not silent.

export const ORBIT_BASE_PERIOD = 36_000

// orbitPeriod is the world's orbital law (Go: GameTuning.OrbitPeriod): one
// revolution on ring N takes ORBIT_BASE_PERIOD × N world-ms, so a hex is
// crossed every ORBIT_BASE_PERIOD / 6 on every ring. Ring 0 (the star) has no
// orbit; callers never consult the period there.
export function orbitPeriod(ring: number): number {
  if (ring <= 0) return 0
  return ORBIT_BASE_PERIOD * ring
}
