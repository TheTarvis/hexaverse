package stations

import (
	"hexaverse/board"
	"hexaverse/galaxy"
	"hexaverse/system"
)

// DeriveOrbit is the LATTICE derivation, sitting beside
// DeriveContinuousOrbit (continuous_orbit.go) since openspec
// add-orbital-system-bodies landed. Additive, not dual-write: the two are
// independently derived from the same seed, neither consulted by the
// other. This lattice form — and the docking/placement code that consumes
// it — dies at link 8-9 of the continuous-space chain
// (re-express-economy-positions), when docking itself moves off the
// lattice; DeriveOrbit is not touched by this change.
//
// DeriveOrbit computes a station's orbital elements as a PURE function of its
// system id and the live galaxy's seed — no volatile input, no store read, no
// clock. Two consequences the change leans on:
//
//   - A healed re-provisioning lands on the exact same orbit, so a partial spawn
//     can be completed without risking a second, differently-placed station.
//   - A fleet already docked to a station resolves its live position by
//     recomputing this in-process, never by re-reading the station store — so a
//     station-store outage cannot break the most common, most critical read.
//
// Placement rules: never the core (a station at the star is nonsense and would
// collide with the star feature), and never the lane-gate ring (a station
// sitting on a departure gate would make "burn to the gate" and "burn to the
// station" the same cell).
//
// boardRadius names what this parameter actually is — the board radius, not
// the lane-gate ring itself (board.GateRing(boardRadius) is a fixed −3 offset
// from it). The misnomer is renamed here (tasks.md 2.8); the KNOWN, OPEN
// defect this rename does NOT fix — boardRadius still isn't board.GateRing,
// so rings 13–15 under a radius-16 board can still receive a station on the
// real lane-gate ring — is filed at
// docs/defects/2026-08-26-station-on-gate-ring.md. Do not "fix" the value
// here; that is a behavior change outside this migration's stated impact.
func DeriveOrbit(galaxySeed int64, systemID string, boardRadius int) system.Orbit {
	seed := galaxy.SystemSeed(galaxySeed, systemID)
	h := mix64(uint64(seed))

	// Rings strictly between the core (0) and boardRadius: [1, boardRadius-1].
	// boardRadius is common.Tuning().BoardRadius, so this is a cross-domain
	// invariant, not a local guess.
	span := boardRadius - 1
	if span < 1 {
		// Degenerate board (radius ≤ 1) — the only legal non-core ring is 1.
		span = 1
	}
	ring := 1 + int(h%uint64(span))

	// Angle within the ring: the schedule's live slot count for it — never a
	// fixed 6×ring (design.md Decision 2's hazard; a ring's slot count varies
	// by band under the pinned Isotropic schedule). boardRadius is the caller's
	// authoritative radius for this system's board (mirroring system.Generate's
	// own board.Schedule(params.Radius) — design.md Decision 3), not the
	// process-wide default.
	sched := board.Schedule(boardRadius)
	angle0 := int(mix64(h) % uint64(sched.Slots(ring)))

	return system.Orbit{
		Ring:   ring,
		Angle0: angle0,
		Period: system.PeriodFor(ring),
		// The direction is NOT hashed independently: it is the system's dominant
		// orbital direction, the same one every disk-born feature of that system's
		// interior shares. A station orbiting against its own disk in half of all
		// systems would be an unmotivated physics exception — the same reason the
		// station orbits at all rather than sitting fixed.
		//
		// Sourced from the ONE exported helper the interior generator itself uses,
		// so a change to generation draw order can never silently diverge the two.
		Dir: system.DominantOrbitDirection(seed),
	}
}

// mix64 is the splitmix64 finalizer — the same avalanche DominantOrbitDirection
// uses. Systems in one galaxy derive from a shared base, so adjacent seeds must
// not correlate into visible banding of station rings.
func mix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return x ^ (x >> 31)
}
