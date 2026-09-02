package fleet

// Shared test-only infrastructure for the add-stationkeep-hold-verb RED-PHASE
// suite in this package (stationkeep_hold_release_test.go,
// stationkeep_reserve_test.go, stationkeep_ordered_preconditions_test.go,
// stationkeep_settlement_consumers_test.go,
// stationkeep_settle_first_seam_test.go).
//
// WHY THIS LEVEL. The exact arithmetic this change turns on — a dry instant
// quantized UP to the millisecond and computed against `fuelAtHoldStart −
// FuelParams.StationKeepReserveTons`, a settlement debit that delegates to
// space.StationKeepUpkeep (which has ALREADY done the ms→s conversion) and
// then divides by FuelParams.DeltaVPerTon, and the seam between the
// settle-first write and the deciding transaction — is only assertable
// against a clock the test controls. The HTTP suite
// (backend/stationkeep_*_e2e_test.go) proves the verbs are REACHABLE through
// the production router; this package's suite proves the numbers are RIGHT.
// Neither substitutes for the other: this chain's signature defect is a
// derivation that is unit-correct and reached by nothing, so both halves ship
// together.
//
// NO FAKES IN THE MATH PATH. The stack below is a real seeded galaxy, a real
// generated system interior, a real system.BodyTable, a real action.Service
// with the real BurnResolver registered, and the real fleet.Service — against
// the Firestore emulator. The ONLY substitution is the world clock, which is
// exactly the injection point common/worldtime.go documents for tests.
//
// ============================================================================
// ASSUMED API CONTRACT (SDET-pinned; the spec names the verbs and their
// behaviour but no Go signature)
// ============================================================================
//
//	func (s *Service) Hold(ctx context.Context, id string) (*Fleet, error)
//	func (s *Service) Release(ctx context.Context, id string) (*Fleet, error)
//	// ...and both added to ServiceInterface, so the handler can reach them.
//
//	var ErrNotOrbiting error       // hold against an effective state that is not an `orbit` park
//	var ErrNotStationKeeping error // release against an effective state that is not a `stationkeep` park
//	var ErrHoldWithoutFuel error   // hold whose spendable fuel above the reserve is zero or negative
//
// The three sentinels must be pairwise distinct — "Both SHALL be rejected
// with their own named reason, DISTINCT FROM ONE ANOTHER" and "with its own
// named reason, DISTINCT FROM the not-orbiting rejection". The tests assert
// that distinctness directly rather than assuming these exact identifiers are
// the only possible spelling; the identifiers themselves are the SDET's
// pinned contract until adjudicated otherwise.
//
//	FuelParams.StationKeepReserveTons float64   // task 2.1
//
// A named tuning knob sourced through DefaultFuelParams(), never a literal at
// a call site. **Its VALUE is an open question for Travis** (design.md Open
// Questions, task 2.1): no test in this suite hardcodes a number for it. Every
// fixture funds itself as `reserve + margin` and every assertion is written
// against `h.reserve`, so a retune of the placeholder changes no test.
//
//	var settleFirstSeamHook func(fleetId string)   // task 7.18, test-only
//
// Invoked by every consumer that performs the preceding, independent
// settle-first write of tasks 4.8/4.9 — `hold`, the burn commit, and refuel's
// transaction-scoped free-hold re-evaluation — immediately AFTER that write's
// own transaction has completed (whether or not it wrote anything) and BEFORE
// the deciding transaction opens. nil in production; the task authorises
// exactly this ("a hook after the settle write") because the window it opens
// is between two transactions of one request and is otherwise unreachable
// from a test. See stationkeep_settle_first_seam_test.go.
//
// space.Park's two new fields are pinned in
// backend/space/stationkeep_dry_instant_fold_test.go as HoldStartMs /
// DryInstantMs.
//
// EXPECTED RED STATE: this package's test build fails to compile —
// undefined: Service.Hold / Service.Release / ErrNotOrbiting /
// ErrNotStationKeeping / ErrHoldWithoutFuel / settleFirstSeamHook /
// FuelParams.StationKeepReserveTons, and Park has no HoldStartMs or
// DryInstantMs field. That is the correct initial red state; no production
// symbol is stubbed into existence to make it compile.

import (
	"context"
	"math"
	"testing"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
)

// holdStack is a full, real, emulator-backed movement stack with a settable
// world clock.
type holdStack struct {
	ctx     context.Context
	clk     *fakeClock
	fsvc    *Service
	asvc    *action.Service
	ssvc    *system.Service
	dao     Dao
	client  *firestore.Client
	gsvc    *galaxy.Service
	bt      *system.BodyTable
	home    string
	bodyId  string // a real, orbiting, non-star body in `home`
	gateId  string // a real lane-gate body in `home` (PeriodMs == 0, motionless), or ""
	laneId  string // the lane gateId serves, or "" when gateId is ""
	rate    float64
	params  FuelParams
	reserve float64
}

// newHoldStack seeds a galaxy, materializes the origin system's interior,
// picks a real orbiting body to hold beside, and wires the real services
// against it. Skips under -short (no emulator).
func newHoldStack(t *testing.T) *holdStack {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := &fakeClock{now: 1_000_000}

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 1, galaxy.DefaultParams())
	if err != nil {
		t.Fatalf("seeding a galaxy for the station-keeping fixture: %v", err)
	}
	home := meta.OriginSystemId
	t.Cleanup(func() {
		common.CleanupFirestoreTestData(t, client, append(
			[]string{"galaxies", "galaxy_pointers", "fleets", "actions", "deltas", "corporations"},
			galaxy.SubcollectionPaths(meta.Id, home)...)...)
	})

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	interior, err := ssvc.GetOrCreateInterior(ctx, home)
	if err != nil {
		t.Fatalf("materializing the origin system interior: %v", err)
	}
	var bodyId string
	for _, f := range interior.Features {
		if f.Type != system.FeatureStar && f.Space != nil {
			bodyId = f.Id
			break
		}
	}
	if bodyId == "" {
		t.Skip("generated origin interior had no orbiting non-star body to hold beside")
	}
	bt, err := ssvc.BodyTable(ctx, home)
	if err != nil {
		t.Fatalf("resolving the origin system body table: %v", err)
	}
	// The gate and THE LANE IT SERVES are resolved together: Service.Jump
	// gates eligibility on `f.AttachedTo == "gate-"+destId` for the
	// destination the NAMED LANE leads to, so a gate id without its own lane
	// id can only ever produce ErrJumpNotAttached.
	var gateId, laneId string
	lanes, err := gsvc.LanesOf(ctx, home)
	if err != nil {
		t.Fatalf("galaxy.LanesOf(%s): %v", home, err)
	}
	for _, ln := range lanes {
		if _, ok := bt.Body("gate-" + ln.OtherSystemId); ok {
			gateId, laneId = "gate-"+ln.OtherSystemId, ln.LaneId
			break
		}
	}
	rate, err := space.StationKeepRate(bt, bodyId)
	if err != nil {
		t.Fatalf("space.StationKeepRate(%q): %v", bodyId, err)
	}
	if !(rate > 0) {
		t.Fatalf("fixture invariant: StationKeepRate(%q) = %v, want strictly positive", bodyId, rate)
	}

	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	asvc.RegisterResolver(burnType, action.KindKinematic, BurnResolver(ssvc))
	dao := NewDaoWithClient(fs)
	fsvc := NewServiceWith(dao, ssvc, gsvc, asvc, clk)

	params := DefaultFuelParams()
	if !(params.StationKeepReserveTons > 0) {
		t.Fatalf("fleet-movement \"Station-Keeping Upkeep Never Drains a Fleet Below Its Reserve\": "+
			"DefaultFuelParams().StationKeepReserveTons = %v, want a \"configured, STRICTLY POSITIVE "+
			"station-keeping reserve\". A zero reserve settles an exhausted hold to zero, which is exactly "+
			"the passive stranding decisions.md (2026-08-29) forbids.", params.StationKeepReserveTons)
	}

	return &holdStack{
		ctx: ctx, clk: clk, fsvc: fsvc, asvc: asvc, ssvc: ssvc, dao: dao, client: client,
		gsvc: gsvc, bt: bt, home: home, bodyId: bodyId, gateId: gateId, laneId: laneId, rate: rate,
		params: params, reserve: params.StationKeepReserveTons,
	}
}

// orbitingFleet writes a fleet parked in a REAL orbit park around the
// stack's body, attached (docked) to it, holding `fuelTons` of fuel. This is
// the exact effective state `hold` requires ("a fleet whose effective park
// mode is currently `orbit`"), and the one a settled body-targeted burn
// produces (space.StateAt's own insertion-orbit fold).
func (h *holdStack) orbitingFleet(t *testing.T, id string, fuelTons float64) *Fleet {
	t.Helper()
	return h.orbitingFleetAround(t, id, h.bodyId, fuelTons)
}

func (h *holdStack) orbitingFleetAround(t *testing.T, id, bodyId string, fuelTons float64) *Fleet {
	t.Helper()
	body, ok := h.bt.Body(bodyId)
	if !ok {
		t.Fatalf("body %q is not in the body table", bodyId)
	}
	standoff := space.InsertionStandoff(body)
	f := Fleet{
		Id:            id,
		CorporationId: "sdet-hold-corp",
		SystemId:      h.home,
		AttachedTo:    bodyId,
		Ships:         []ShipEntry{{Class: ClassSeed}},
		Cargo:         map[string]float64{"fuel": fuelTons},
		CreatedAt:     h.clk.Now(),
		UpdatedAt:     h.clk.Now(),
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind:     space.ParkOrbit,
			BodyId:   bodyId,
			Radius:   standoff,
			PeriodMs: space.InsertionPeriod(standoff),
			Phase:    0,
			EpochMs:  h.clk.Now(),
		}},
	}
	if fuelTons == 0 {
		f.Cargo = map[string]float64{}
	}
	f.StateDoc = EncodeKinematicState(f.State)
	if err := h.dao.Save(h.ctx, f); err != nil {
		t.Fatalf("seeding orbiting fleet %q: %v", id, err)
	}
	return &f
}

// driftingFleet, pointParkedFleet: the two other "not an orbit park"
// effective states `hold` must reject by name.
func (h *holdStack) driftingFleet(t *testing.T, id string) {
	t.Helper()
	h.saveState(t, id, space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{
		Anchor: space.Vec3{X: 1e5}, Velocity: space.Vec3{X: 1}, EpochMs: h.clk.Now(),
	}})
}

func (h *holdStack) pointParkedFleet(t *testing.T, id string) {
	t.Helper()
	h.saveState(t, id, space.ShipState{Mode: space.ModeParked, Park: &space.Park{
		Kind: space.ParkPoint, Point: space.Vec3{X: 1e5},
	}})
}

func (h *holdStack) saveState(t *testing.T, id string, s space.ShipState) {
	t.Helper()
	f := Fleet{
		Id: id, CorporationId: "sdet-hold-corp", SystemId: h.home,
		Ships: []ShipEntry{{Class: ClassSeed}}, Cargo: map[string]float64{"fuel": h.reserve + 50},
		CreatedAt: h.clk.Now(), UpdatedAt: h.clk.Now(), State: s,
	}
	f.StateDoc = EncodeKinematicState(f.State)
	if err := h.dao.Save(h.ctx, f); err != nil {
		t.Fatalf("seeding fleet %q: %v", id, err)
	}
}

// unresolvableBodyId names a body that is deliberately NOT in the system's
// body table, so any attempt to evaluate a park anchored to it fails with
// space.ErrUnknownBody rather than producing a park mode.
const unresolvableBodyId = "sdet-body-that-does-not-exist"

// inTransitFleet stores a fleet mid-lane-transit: `Jump != nil` is the one
// state fleet-movement's "Effective Position Resolution" forbids evaluating
// stored kinematic state for at all ("a fleet in transit has no position in
// either system and its stale stored state SHALL NOT be evaluated by any
// reader").
//
// ITS STORED PARK IS ANCHORED TO A BODY THAT DOES NOT EXIST. That is the
// discriminator for the scenario's "the fleet's stored kinematic state is
// never evaluated to reach that rejection" clause: an implementation that
// folds the stored state before checking `Jump` gets space.ErrUnknownBody (a
// bodyless 500), not the lane-transit reason. Its fuel is comfortably above
// the reserve, so no fuel precondition can fire first either.
func (h *holdStack) inTransitFleet(t *testing.T, id string) *Fleet {
	t.Helper()
	f := Fleet{
		Id: id, CorporationId: "sdet-hold-corp", SystemId: h.home,
		Ships:     []ShipEntry{{Class: ClassSeed}},
		Cargo:     map[string]float64{"fuel": h.reserve + 50},
		CreatedAt: h.clk.Now(), UpdatedAt: h.clk.Now(),
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{
			Kind: space.ParkOrbit, BodyId: unresolvableBodyId,
			Radius: 100, PeriodMs: 60_000, Phase: 0, EpochMs: h.clk.Now(),
		}},
		Jump: &JumpTransit{
			LaneId: "sdet-lane", DestSystemId: "sdet-dest",
			DepartMs: h.clk.Now(), ArriveMs: h.clk.Now() + 10_000_000,
		},
	}
	f.StateDoc = EncodeKinematicState(f.State)
	if err := h.dao.Save(h.ctx, f); err != nil {
		t.Fatalf("seeding in-transit fleet %q: %v", id, err)
	}
	return &f
}

// holdOrFail runs the real verb and returns the stored stationkeep park.
func (h *holdStack) holdOrFail(t *testing.T, id string) *space.Park {
	t.Helper()
	got, err := h.fsvc.Hold(h.ctx, id)
	if err != nil {
		t.Fatalf("arranging a hold on %q: %v", id, err)
	}
	if got.State.Park == nil || got.State.Park.Kind != space.ParkStationkeep {
		t.Fatalf("arranging a hold on %q produced %+v, want a ParkStationkeep park", id, got.State)
	}
	return got.State.Park
}

// stored re-reads a fleet straight from the DAO — the STORED document, never
// a folded read. Every "was this actually persisted?" assertion goes through
// here, because Service.Get deliberately folds (and, per this change, settles)
// what it reads.
func (h *holdStack) stored(t *testing.T, id string) *Fleet {
	t.Helper()
	f, err := h.dao.Get(h.ctx, id)
	if err != nil {
		t.Fatalf("re-reading stored fleet %q: %v", id, err)
	}
	if f == nil {
		t.Fatalf("stored fleet %q does not exist", id)
	}
	return f
}

// --- the two closed-form quantities the spec states literally --------------

// wantDryInstant is the spec's own definition of the dry instant, WITH NO
// CLOSED FORM AT ALL:
//
//	spendableDeltaV =
//	    (fuelAtHoldStart − FuelParams.StationKeepReserveTons) × FuelParams.DeltaVPerTon
//	dryInstant = the EARLIEST integer-millisecond world time T at which
//	    space.StationKeepUpkeep(rate, holdStart, T) ≥ spendableDeltaV
//
// REVISED 2026-09-02 (cause: SDET re-derivation, not a spec change and not a
// red suite). The earlier version transcribed a closed form —
// `holdStart + ceil((spendable/rate) * 1000)`. The requirement states no such
// form: it deliberately states an INVERSE of a named function ("the earliest
// world time T, quantized up to an integer millisecond, at which
// space.StationKeepUpkeep(rate, holdStart, T) reaches or exceeds..."), and
// that inverse is a unique integer computable WITHOUT knowing the function's
// internal arithmetic at all. Any closed form is an inference about those
// internals, and the two plausible associations —
// `ceil((s/r)*1000)` and `ceil(1000*s/r)` — provably disagree with the
// predicate, and with each other, by one millisecond under double rounding.
// (Measured: for hold windows past ~1e12 ms both diverge; within every
// reachable fuel load they agree. See the SDET note on
// TestDryInstantFor_SatisfiesTheSpecPredicateAcrossTheReachableDomain.)
//
// Deriving the expectation from the predicate rather than from a transcription
// is what makes this helper an INDEPENDENT check on production's closed form
// instead of a second copy of it.
//
// THE RESERVE SUBTRACTION IS LOAD-BEARING: "a dry instant computed against
// the full `fuelAtHoldStart` would settle the fleet to zero, the outcome the
// guardrail forbids."
func wantDryInstant(holdStart common.WorldMillis, fuelTons, rate float64, p FuelParams) common.WorldMillis {
	spendableDeltaV := (fuelTons - p.StationKeepReserveTons) * p.DeltaVPerTon
	return leastInstantReachingBudget(holdStart, spendableDeltaV, rate)
}

// leastInstantReachingBudget is the requirement's inverse, evaluated against
// the real space.StationKeepUpkeep: the smallest integer-millisecond T (at
// least one millisecond past holdStart, since the quantization is a ceiling
// and any strictly positive budget takes strictly positive time) whose
// accrual reaches or exceeds `budget`.
//
// It is seeded from both candidate closed forms and then WALKED to the true
// answer, so the walk is at most a millisecond or two while the result owes
// nothing to either association's correctness.
func leastInstantReachingBudget(holdStart common.WorldMillis, budget, rate float64) common.WorldMillis {
	reached := func(t common.WorldMillis) bool {
		return space.StationKeepUpkeep(rate, holdStart, t) >= budget
	}
	a := math.Ceil((budget / rate) * 1000)
	b := math.Ceil(1000 * budget / rate)
	seed := math.Min(a, b)
	if !(seed >= 1) || math.IsInf(seed, 0) || math.IsNaN(seed) {
		seed = 1
	}
	t := holdStart + common.WorldMillis(int64(seed))
	for i := 0; !reached(t) && i < 64; i++ {
		t++
	}
	for i := 0; t > holdStart+1 && reached(t-1) && i < 64; i++ {
		t--
	}
	return t
}

// wantUpkeepTons is `release`'s own closed-form debit, transcribed as the
// requirement states it — a DELEGATION to space.StationKeepUpkeep, which
// already performs the ms→s conversion internally, divided by DeltaVPerTon:
//
//	upkeepTons(from, to) = space.StationKeepUpkeep(rate, from, to) / FuelParams.DeltaVPerTon
//
// "No caller SHALL restate that function's arithmetic inline... a caller SHALL
// NOT divide an elapsed WorldMillis difference by 1000 before passing it in,
// and SHALL NOT divide the returned figure by 1000 afterwards." This helper
// calls the real function for exactly that reason: if production restates the
// arithmetic and gets it wrong, this test's expectation does not move with it.
func wantUpkeepTons(rate float64, holdStart, at common.WorldMillis, p FuelParams) float64 {
	return space.StationKeepUpkeep(rate, holdStart, at) / p.DeltaVPerTon
}

// oneMillisecondOfUpkeepTons is the ceiling slack: the dry instant is
// quantized UP to the next whole millisecond, so the accrual evaluated AT the
// stored dry instant can exceed the spendable budget by at most this much.
// Task 3.8's bounded interval is exactly one millisecond wide for this
// reason, which is why an equality assertion there is unsatisfiable.
func oneMillisecondOfUpkeepTons(rate float64, p FuelParams) float64 {
	return (rate * 0.001) / p.DeltaVPerTon
}

func fuelOf(f *Fleet) float64 { return f.Cargo["fuel"] }

// nearly asserts got ≈ want, reporting `what` (the scenario clause under
// test) verbatim so a failure names the requirement, not just two numbers.
func nearly(t *testing.T, got, want, tol float64, what string) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s: got %v, want %v (tolerance %v, off by %v)", what, got, want, tol, math.Abs(got-want))
	}
}

// math1e9Rel is a relative tolerance for a float64 quantity produced by the
// same closed-form expression evaluated through two independent code paths
// (production and this test). Deliberately tight enough that a ×5 or ×1000
// unit error cannot pass, and loose enough that ordinary double rounding
// cannot fail.
func math1e9Rel(want float64) float64 {
	tol := math.Abs(want) * 1e-9
	if tol < 1e-9 {
		tol = 1e-9
	}
	return tol
}

var _ = common.WorldMillis(0)
