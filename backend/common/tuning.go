package common

import (
	"sync"

	"hexaverse/config"
)

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
// scale changes how fast the clock RUNS. Both work end to end now: every read
// that carries a worldTime carries the clock's scale beside it, and the client
// clock (frontend/lib/client-clock) projects off the SERVED pair rather than
// assuming 1. Prod and dev still run at scale 1; the Playwright stack boots its
// backend warped (frontend/e2e/setup/backend-stack.ts) so a suite does not wait
// out a burn in real time.
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

	// ——— Orbits: deliberately NOT here ———
	//
	// There is no global orbital knob. A body's period is a Keplerian function
	// of its own radius (system.keplerPeriodMs), and a parked ship's is
	// computed once at settle time from the park's own radius. Both are
	// properties of where the thing IS, not pacing an operator dials — so
	// there is nothing here to retune, and no world-wide law that could
	// re-pace a system somebody already visited.

	// ——— Sensing & intel: deliberately NOT here ———
	//
	// There is no global sensing knob. A focused scan prices its OWN duration
	// from its range (fleet/params.go: roundTripMs = ScanBaseDurationMs +
	// ScanRoundTripMsPerUnit × d), and the perception radii are distances in
	// continuous space that only their own package can state meaningfully
	// (disclosure/params.go: PassiveRange, FocusedScanRange). The flat
	// ScanDuration that used to sit here priced the deleted 360° radial sweep.

	// ——— System extent (structural invariant, not pacing) ———

	// MaxOrbitalIndex is the highest orbital index a generated system reaches:
	// the star-parented shells a system's bodies are drawn into run over the
	// INCLUSIVE range [0, MaxOrbitalIndex], so at the shipped value of 16 there
	// are seventeen of them. It is an index, not a count and not a distance —
	// `system.ContinuousRadius(idx)` turns it into the physical radius, and
	// `SystemInterior.Extent = ContinuousRadius(MaxOrbitalIndex)` is the
	// continuous upper bound every generated body sits inside.
	//
	// Read it as an inclusive maximum. A reader who mistakes it for a count and
	// writes `r.Intn(MaxOrbitalIndex)` on an exclusive-bound reading silently
	// loses the outermost shell.
	//
	// It stays a cross-domain invariant: `system.GenerationParams.Radius`
	// sources from it, and `system/params.go`'s calibration invariant
	// (`galaxy.DefaultParams().MaxRings - 1 <= Radius`) compares against it, so
	// there is exactly one of it rather than the value 16 written in several
	// places with "must match" comments.
	MaxOrbitalIndex int
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

		// Geometry
		MaxOrbitalIndex: 16,
	}
}

var (
	tuningMu     sync.RWMutex
	activeTuning = DefaultTuning()
)

// init applies the one env-level tuning override this codebase has:
// LANE_MS_PER_DISTANCE (config.ServiceConfig.LaneMsPerDistance). 0 — the flag's
// default, and what every environment that sets nothing gets — leaves the
// shipped baseline exactly as DefaultTuning states it, so prod and dev are
// untouched. The Playwright stack sets it so a lane jump does not cost the
// suite real minutes of wall clock.
//
// It runs before any service is constructed (package-level vars initialize
// first, then init, and config's own init — flag parsing included — has already
// run because common imports config), which matters: the pacing knobs are
// captured at construction, per the liveness caveat on GameTuning.
func init() {
	if v := config.ServiceConfig.LaneMsPerDistance; v > 0 {
		t := activeTuning
		t.LaneMsPerDistance = v
		activeTuning = t
	}
}

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
