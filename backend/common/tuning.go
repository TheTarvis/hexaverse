package common

import "sync"

// GameTuning is the single source of truth for gameplay PACING — the knobs that
// govern how fast the world feels. One struct, one file, primitives only: it is
// deliberately shaped so a future admin page can load it from Firestore, hand it
// to SetTuning, and retune a live world without a deploy.
//
// # What belongs here
//
// PACING knobs only — values that govern a RUNNING world and that an operator
// would plausibly retune: how long a cell of burn costs, how long a unit of
// lane takes to cross, how long one revolution takes at ring 1. Plus the
// handful of cross-domain STRUCTURAL invariants that were previously
// duplicated with "must match" comments.
//
// Sensing is the instructive absence. A scan's duration and a sensor's reach
// are pacing in every felt sense, and they are still not here: both are
// denominated in continuous-space DISTANCE, and a distance belongs to the
// package that defines the geometry it measures. See the sensing note on the
// struct below for where they went.
//
// # What does NOT belong here
//
// World-GENERATION params (galaxy.GenerationParams, system.GenerationParams's
// body/hazard dials, corporations.SpawnParams's placement rules). Those are baked
// in at seed/spawn time — retuning them on a live world changes nothing that
// already exists, so an admin page editing them would be lying to the operator.
// They stay in their domain's params.go.
//
// The bake-in is what disqualifies them, not the subject matter: a knob earns
// its place here when retuning it re-paces worlds that already exist, and a
// knob whose value is frozen into stored data at generation time never can.
// Anything that can be made derived-at-read is welcome to move here.
//
// # Layering
//
// common imports no domain package, so this holds primitives and common types
// (WorldMillis) — never a domain type like charts.Tier. Domains keep their
// own params structs (fleet.MovementParams etc.) and SOURCE their values from
// here. That way `fleet` still owns the meaning of its knobs; `common` only owns
// the numbers.
//
// # Speed, the other knob
//
// This is distinct from config.WorldTimeScale (see worldtime.go), which warps sim
// time against the wall clock globally. Tuning changes what the world COSTS;
// scale changes how fast the clock RUNS. Today scale is 1 everywhere (the client
// clock in frontend/hooks/use-world-time.ts hardcodes 1 and is not yet shipped the
// server's scale), so tuning is the knob that actually works end-to-end.
//
// # Liveness caveat (read before building the admin page)
//
// Values are read at CONSTRUCTION today: services call Default*Params() when they
// are built, and action resolvers capture params by value at RegisterResolver.
// So SetTuning after startup will NOT reach an already-registered resolver — it
// needs a process restart. Making retuning hot means having those call sites read
// Tuning() per-invocation instead of capturing. Deliberately not done yet: it
// costs a read on every resolve for a knob nobody turns at runtime.
//
// One property already works in our favour: an action's ETA is frozen at commit
// (#0005), so retuning never rewrites in-flight orders — it only prices new ones.
type GameTuning struct {
	// ——— Movement (fleet) ———

	// LaneMsPerDistance is the world-ms to cross one unit of 3D lane length
	// between systems (#0008). A leg's time is length × this, frozen at commit.
	LaneMsPerDistance float64

	// ——— Orbits (everything on a board: bodies AND coasting fleets) ———

	// OrbitBasePeriod is the world-ms for one revolution at ring 1. It is the
	// world's ONE orbital law, applied through OrbitPeriod(ring) — see there for
	// what it buys you and what it costs.
	OrbitBasePeriod WorldMillis

	// ——— Sensing & intel: deliberately NOT here ———
	//
	// There is no global sensing knob. A focused scan prices its OWN duration
	// from its range (fleet/params.go: roundTripMs = ScanBaseDurationMs +
	// ScanRoundTripMsPerUnit × d), and the perception radii are distances in
	// continuous space that only their own package can state meaningfully
	// (disclosure/params.go: PassiveRange, FocusedScanRange). The flat
	// ScanDuration that used to sit here priced the deleted 360° radial sweep.

	// ——— Board geometry (structural invariant, not pacing) ———

	// BoardRadius is the cell/ring radius of every system board — the ring the lane
	// gates sit on. It is a CROSS-DOMAIN INVARIANT: system generation, fleet gate
	// placement, and the spawn rim ring must all agree, and before this struct
	// existed the value 16 was written in three places with "must match" comments.
	// It lives here so there is exactly one of it.
	BoardRadius int
}

// DefaultTuning is the playtest baseline.
//
// Retuned 2026-07-13 for pace: in-system movement was priced at one world-MINUTE
// per step (60s of real time at scale 1), which made the slice feel sluggish to
// play, and lane travel was uniformly sped up with it. In-system movement is
// priced by its own burn solve now; LaneMsPerDistance is what survives of that
// retune.
func DefaultTuning() GameTuning {
	return GameTuning{
		// Movement
		LaneMsPerDistance: 2_500, // 5s per unit of lane length (was 60_000)

		// Orbits — one revolution at ring 1. Under the pinned banded slot
		// schedule the per-cell cadence is NOT a uniform OrbitBasePeriod/6
		// everywhere (see OrbitPeriod's doc comment) — it varies by ring band,
		// fastest on the sparsest inner rings and slowest where a band has
		// just doubled its slot count.
		OrbitBasePeriod: 36000,

		// Geometry
		BoardRadius: 16,
	}
}

// OrbitPeriod is the world's orbital law: one revolution on ring N takes
// OrbitBasePeriod × N, so the further out you are the longer you take to come
// round. It applies to EVERYTHING resting on a board — a planet and a coasting
// fleet on the same ring keep the same period, because they're the same physics.
// (There used to be a separate CoastPeriod for fleets, flat and un-scaled by ring,
// which quietly meant a fleet at the rim crossed cells faster than one near the
// star. It read as a second knob; it was really the same knob with a bug in it.)
//
// Two consequences worth knowing before you retune:
//
//   - The PERIOD law is linear in ring (OrbitBasePeriod × N) — that part is
//     exactly what it looks like. But under the pinned banded slot schedule
//     (board.Schedule; board-tactical-math, "The Production Slot Schedule Is
//     Pinned to Isotropic") a ring's slot count is NOT 6 × N — it is constant
//     within a band and only doubles at a handful of ring boundaries (2, 3, 5,
//     9, 17). So the PER-SLOT cadence, period / Slots(ring), is uniform only
//     WITHIN a band and drops by half at every doubling boundary: two rings
//     with the same period (impossible here, since period scales with ring
//     too) or, more to the point, two DIFFERENT rings can have wildly
//     different per-cell rates once their slot counts diverge — a ring just
//     past a doubling boundary advances its cells twice as slowly, cell for
//     cell, as the ring just before it, even though both take longer overall
//     to complete a full revolution than any inner ring. The old hex-era
//     shortcut ("a ring has 6×N cells, so the ring factor cancels and the
//     rate you see is uniform everywhere") is FALSE under this schedule and
//     must not be re-derived from this comment.
//   - A coasting fleet therefore DRIFTS. Parking beside a body no longer holds
//     station beside it (bodies orbit either way; coast is always prograde) —
//     docking is what holds station. That is the intended shape: coast = a free
//     orbit at your radius, dock = attached to a body, riding it.
//
// Ring 0 (the star) has no orbit; the period there is meaningless and the callers
// return the centre cell without consulting it.
func (t GameTuning) OrbitPeriod(ring int) WorldMillis {
	if ring <= 0 {
		return 0
	}
	return t.OrbitBasePeriod * WorldMillis(ring)
}

var (
	tuningMu     sync.RWMutex
	activeTuning = DefaultTuning()
)

// Tuning returns the live gameplay tuning. Cheap (a read-locked struct copy), so
// call sites are free to read it per-invocation rather than caching it — that is
// what will make an admin page's edits take effect without a restart.
func Tuning() GameTuning {
	tuningMu.RLock()
	defer tuningMu.RUnlock()
	return activeTuning
}

// SetTuning replaces the live gameplay tuning. This is the seam a future admin
// page writes through (load from Firestore on boot + on change → SetTuning).
// Tests use it to pin a knob without touching every call site.
//
// See the liveness caveat on GameTuning: call sites that captured params at
// construction won't observe the change until they're rebuilt.
func SetTuning(t GameTuning) {
	tuningMu.Lock()
	defer tuningMu.Unlock()
	activeTuning = t
}
