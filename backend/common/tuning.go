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
// would plausibly retune: how long a hex of burn costs, how long a scan takes,
// how far a passive sensor reaches. Plus the handful of cross-domain STRUCTURAL
// invariants that were previously duplicated with "must match" comments.
//
// # What does NOT belong here
//
// World-GENERATION params (galaxy.GenerationParams, system.GenerationParams's
// body/hazard dials, corporations.SpawnParams's placement rules). Those are baked
// in at seed/spawn time — retuning them on a live world changes nothing that
// already exists, so an admin page editing them would be lying to the operator.
// They stay in their domain's params.go.
//
// The bake-in is what disqualifies them, not the subject matter. OrbitBasePeriod
// reads like a generation dial and used to live in system.GenerationParams, but a
// body's period is DERIVED at read (system.PeriodFor) rather than persisted on the
// feature — so retuning it re-paces bodies in worlds that already exist, and it
// earns its place here. Anything else that can be made derived-at-read is welcome
// to follow it.
//
// # Layering
//
// common imports no domain package, so this holds primitives and common types
// (WorldMillis) — never a domain type like observation.Tier. Domains keep their
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

	// MsPerTile is the world-ms cost to burn across one hex of a system board.
	// This is the single biggest lever on how fast the game FEELS in-system.
	MsPerTile WorldMillis
	// LaneMsPerDistance is the world-ms to cross one unit of 3D lane length
	// between systems (#0008). A leg's time is length × this, frozen at commit.
	LaneMsPerDistance float64
	// InterceptHorizon bounds the lead-solve search for a moving target. Not a
	// "felt" duration — it's a search bound. Raise it only if intercepts against
	// slow, distant targets start failing to find a solution.
	InterceptHorizon WorldMillis

	// ——— Orbits (everything on a board: bodies AND coasting fleets) ———

	// OrbitBasePeriod is the world-ms for one revolution at ring 1. It is the
	// world's ONE orbital law, applied through OrbitPeriod(ring) — see there for
	// what it buys you and what it costs.
	OrbitBasePeriod WorldMillis

	// ——— Sensing & intel (observation) ———

	// ScanDuration is the world-ms an active scan takes; its ETA is
	// committedAt + ScanDuration.
	ScanDuration WorldMillis
	// ScanRadius bounds what a scan reveals, in hexes. 0 = the whole system.
	ScanRadius int
	// AmbientRadius is the passive sensor bubble, in hexes, that rides any unit.
	AmbientRadius int

	// ——— Board geometry (structural invariant, not pacing) ———

	// BoardRadius is the hex radius of every system board — the ring the lane
	// gates sit on. It is a CROSS-DOMAIN INVARIANT: system generation, fleet gate
	// placement, and the spawn rim ring must all agree, and before this struct
	// existed the value 16 was written in three places with "must match" comments.
	// It lives here so there is exactly one of it.
	BoardRadius int
}

// DefaultTuning is the playtest baseline.
//
// Retuned 2026-07-13 for pace: a hex of burn was one world-MINUTE (60s of real
// time at scale 1), which made the slice feel sluggish to play. It is now 5s.
// Scan came down from a world-hour to 30s for the same reason. The RELATIVE cost
// of a hex vs a lane vs a scan is preserved — this is a uniform speed-up, not a
// rebalance.
func DefaultTuning() GameTuning {
	return GameTuning{
		// Movement
		MsPerTile:         2_500,      // 5s per hex   (was 60_000 — one world-minute)
		LaneMsPerDistance: 2_500,      // 5s per unit of lane length (was 60_000)
		InterceptHorizon:  86_400_000, // one world-day of lead search

		// Orbits — one revolution at ring 1; a hex is crossed every value/6, on
		// every ring. 3_600_000 = a hex per 10 real minutes (imperceptible);
		// 60_000 = a hex per 10s; 600 = a hex per 100ms (a spinning demo).
		OrbitBasePeriod: 36000,

		// Sensing
		ScanDuration:  30_000, // 30s      (was 3_600_000 — one world-hour)
		ScanRadius:    0,      // 0 = whole system
		AmbientRadius: 3,      // hexes

		// Geometry
		BoardRadius: 16,
	}
}

// OrbitPeriod is the world's orbital law: one revolution on ring N takes
// OrbitBasePeriod × N, so the further out you are the longer you take to come
// round. It applies to EVERYTHING resting on a board — a planet and a coasting
// fleet on the same ring keep the same period, because they're the same physics.
// (There used to be a separate CoastPeriod for fleets, flat and un-scaled by ring,
// which quietly meant a fleet at the rim crossed hexes faster than one near the
// star. It read as a second knob; it was really the same knob with a bug in it.)
//
// Two consequences worth knowing before you retune:
//
//   - A ring has 6 × N cells, so the ring factor cancels and the rate you actually
//     SEE is uniform: one hex crossed every OrbitBasePeriod / 6. At the 3_600_000
//     baseline that's a hex every 10 real minutes — motion is on, but far below
//     the threshold of noticing. 60_000 gives a hex every 10s.
//   - A coasting fleet therefore DRIFTS. Parking beside a body no longer holds
//     station beside it (bodies orbit either way; coast is always prograde) —
//     docking is what holds station. That is the intended shape: coast = a free
//     orbit at your radius, dock = attached to a body, riding it.
//
// Ring 0 (the star) has no orbit; the period there is meaningless and the callers
// return the centre hex without consulting it.
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
