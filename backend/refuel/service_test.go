package refuel

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"testing"

	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/space"
	"hexaverse/stations"

	"cloud.google.com/go/firestore"
)

// =============================================================================
// Part 1 — pure/unit level, no emulator: computeCost and precondition ordering
// against hand-written fakes of the two narrow, consumer-declared interfaces
// this service depends on (FleetSource, CreditSource). These fakes fail the
// test loudly if the transaction phase is ever reached, which is exactly the
// assertion these tests need: every precondition below is checked BEFORE
// s.db.RunTransaction is ever called, so a correctly-ordered rejection never
// needs a live Firestore transaction at all.
// =============================================================================

// fakeFleetSource is a hand-written fake, not a gomock mock: FleetSource is a
// two-method, service-level interface declared by THIS package (not a DAO),
// and its second method returns another package's opaque, unconstructable-
// from-outside type (fleet.FuelCreditPlan has no exported constructor) — the
// only real value it can produce comes from an actual Firestore transaction.
// A fake that panics loudly if that method is ever reached is therefore the
// correct double for a unit test that only exercises PRE-transaction
// rejections.
type fakeFleetSource struct {
	t        *testing.T
	fleet    *fleet.Fleet
	fleetErr error
	getCalls int
}

func (f *fakeFleetSource) Get(_ context.Context, _ string) (*fleet.Fleet, error) {
	f.getCalls++
	return f.fleet, f.fleetErr
}

func (f *fakeFleetSource) PrepareFuelCreditInTx(_ context.Context, _ *firestore.Transaction, _ string, _ float64) (*fleet.FuelCreditPlan, error) {
	f.t.Helper()
	f.t.Fatal("PrepareFuelCreditInTx unexpectedly called — a precondition should have rejected before the transaction phase")
	return nil, nil
}

type fakeCreditSource struct{ t *testing.T }

func (c *fakeCreditSource) PrepareCreditInTx(_ context.Context, _ *firestore.Transaction, _, _ string, _ corporations.LedgerEntry, _ common.WorldMillis) (*corporations.CreditPlan, error) {
	c.t.Helper()
	c.t.Fatal("PrepareCreditInTx unexpectedly called — a precondition should have rejected before the transaction phase")
	return nil, nil
}

// validOpKey is a syntactically valid, non-reserved operation key — 16-64
// chars of [A-Za-z0-9_-] (corporations.ValidateOperationKey).
func validOpKey(seed string) string {
	k := "opkey-" + strings.ReplaceAll(seed, "_", "-")
	for len(k) < 20 {
		k += "0"
	}
	if len(k) > 64 {
		k = k[:64]
	}
	return k
}

// dockedFleet is a fleet docked at the station feature id, owned by corpID,
// with capacity for the seed hull's default 200-ton hold and the given
// cargo already aboard.
func dockedFleet(corpID string, cargo map[string]float64) *fleet.Fleet {
	return &fleet.Fleet{
		Id: "fleet-x", CorporationId: corpID, SystemId: "sys-x",
		AttachedTo: stations.StationFeatureId,
		Cargo:      cargo,
	}
}

func rejectionOnly(t *testing.T, svc *Service, corpID, fleetID string, req Request) error {
	t.Helper()
	_, err := svc.Refuel(context.Background(), "acct-x", corpID, fleetID, req)
	return err
}

// --- Refuel Requires Fleet Ownership, 404 Before Any Other Precondition ----

func TestRefuelService_Scenario_UnauthenticatedRequesterRejectsBeforeFleetLookup(t *testing.T) {
	fs := &fakeFleetSource{t: t}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "" /* corpID */, "fleet-x", Request{Tons: 5, OperationKey: validOpKey("unauth")})
	if !errors.Is(err, ErrUnauthenticated) {
		t.Errorf("err = %v, want ErrUnauthenticated", err)
	}
	if fs.getCalls != 0 {
		t.Errorf("fleet lookup ran %d times; an unauthenticated request must never reach it", fs.getCalls)
	}
}

func TestRefuelService_Scenario_UnknownFleetIsHidden(t *testing.T) {
	fs := &fakeFleetSource{t: t, fleet: nil, fleetErr: nil}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-ghost", Request{Tons: 5, OperationKey: validOpKey("unknown")})
	if !errors.Is(err, ErrHidden) {
		t.Errorf("err = %v, want ErrHidden", err)
	}
}

func TestRefuelService_Scenario_ForeignCorporationIsHidden(t *testing.T) {
	fs := &fakeFleetSource{t: t, fleet: dockedFleet("corp-owner", nil)}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-stranger", "fleet-x", Request{Tons: 5, OperationKey: validOpKey("foreign")})
	if !errors.Is(err, ErrHidden) {
		t.Errorf("err = %v, want ErrHidden", err)
	}
}

// TestRefuelService_Scenario_EmptyFleetOwnerNeverMatchesARequester pins the
// direction of "An empty resolved corporation id SHALL never be treated as a
// match against a fleet whose own corporationId is also empty or absent"
// that is actually reachable past the earlier corpID=="" check: an
// AUTHENTICATED, non-empty requester corp id must still be hidden from a
// dev-seeded, ownerless fleet — an empty fleet owner is never "public",
// it is simply never matchable.
func TestRefuelService_Scenario_EmptyFleetOwnerNeverMatchesANonEmptyRequester(t *testing.T) {
	fs := &fakeFleetSource{t: t, fleet: dockedFleet("" /* ownerless */, nil)}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 5, OperationKey: validOpKey("ownerless")})
	if !errors.Is(err, ErrHidden) {
		t.Errorf("err = %v, want ErrHidden (an ownerless fleet is never a match)", err)
	}
}

// --- Positive Finite Tonnage Within the Fleet's Free Hold -------------------

func TestRefuelService_Scenario_InvalidTonnageRejectsBeforeFleetLookup(t *testing.T) {
	cases := map[string]float64{
		"zero":     0,
		"negative": -1,
		"NaN":      math.NaN(),
		"posInf":   math.Inf(1),
		"negInf":   math.Inf(-1),
	}
	for name, tons := range cases {
		t.Run(name, func(t *testing.T) {
			fs := &fakeFleetSource{t: t}
			svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

			err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: tons, OperationKey: validOpKey("tons-" + name)})
			if !errors.Is(err, ErrInvalidTonnage) {
				t.Errorf("tons=%v: err = %v, want ErrInvalidTonnage", tons, err)
			}
			if fs.getCalls != 0 {
				t.Errorf("tons=%v: fleet lookup ran %d times; invalid tonnage must reject before it", tons, fs.getCalls)
			}
		})
	}
}

// TestRefuelService_Scenario_TinyPositiveTonnageIsNotRejectedAsInvalid is an
// SDET-added boundary probe just past the zero floor: a vanishingly small
// but strictly positive, finite tonnage must clear the tonnage gate and
// reach ownership resolution (proven here by getting all the way to a
// DISTINCT rejection reason — ErrHidden for a foreign fleet — rather than
// ErrInvalidTonnage).
func TestRefuelService_Scenario_TinyPositiveTonnageIsNotRejectedAsInvalid(t *testing.T) {
	fs := &fakeFleetSource{t: t, fleet: dockedFleet("corp-owner", nil)}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-stranger", "fleet-x", Request{Tons: 1e-9, OperationKey: validOpKey("tiny")})
	if errors.Is(err, ErrInvalidTonnage) {
		t.Errorf("tons=1e-9 was rejected as invalid tonnage; want it to clear the tonnage gate")
	}
	if !errors.Is(err, ErrHidden) {
		t.Errorf("err = %v, want ErrHidden (proving the tonnage gate passed and ownership ran)", err)
	}
}

// --- Refuel Requires the Fleet Docked To the Selling Station ---------------

func TestRefuelService_Scenario_UndockedFleetIsRejected(t *testing.T) {
	// AttachedTo == "" covers coast, burn, laneTransit, and laneHold alike:
	// fuel-purchase's docked check is a pure relationship test on AttachedTo
	// (fleet.Fleet.DockedTo), never a kinematic-mode switch, so every
	// non-docked mode collapses to this ONE code path and this ONE fake
	// shape exercises all four "not docked" scenarios named in the spec.
	f := dockedFleet("corp-real", nil)
	f.AttachedTo = ""
	fs := &fakeFleetSource{t: t, fleet: f}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 5, OperationKey: validOpKey("undocked")})
	if !errors.Is(err, ErrNotDockedAtStation) {
		t.Errorf("err = %v, want ErrNotDockedAtStation", err)
	}
}

// TestRefuelService_Scenario_DockedToNonStationFeatureIsRejectedSameAsUndocked
// pins fuel-purchase "A feature the acting fleet is docked to that is not
// of the station type SHALL be rejected with the same reason as 'not docked
// to a station'" — a genuinely different internal branch (docked == true,
// but the host id disagrees) than the undocked case above.
func TestRefuelService_Scenario_DockedToNonStationFeatureIsRejectedSameAsUndocked(t *testing.T) {
	f := dockedFleet("corp-real", nil)
	f.AttachedTo = "feat-mineable-body-7"
	fs := &fakeFleetSource{t: t, fleet: f}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 5, OperationKey: validOpKey("wrong-feature")})
	if !errors.Is(err, ErrNotDockedAtStation) {
		t.Errorf("err = %v, want ErrNotDockedAtStation", err)
	}
}

// --- Positive Finite Tonnage Within the Fleet's Free Hold (capacity leg) --

func TestRefuelService_Scenario_ExceedingFreeHoldIsRejectedOutright(t *testing.T) {
	// Default seed hull capacity is 200 tons (fleet.DefaultClassStats);
	// 195 tons already aboard leaves 5 tons of free hold.
	f := dockedFleet("corp-real", map[string]float64{"fuel": 195})
	fs := &fakeFleetSource{t: t, fleet: f}
	svc := NewService(fleet.DefaultFuelParams(), fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 10, OperationKey: validOpKey("overhold")})
	if !errors.Is(err, ErrExceedsFreeHold) {
		t.Errorf("err = %v, want ErrExceedsFreeHold", err)
	}
}

// TestRefuelService_Scenario_ExactlyFreeHoldIsNotRejected is an SDET-added
// ±1 boundary probe: requesting EXACTLY the free hold available must clear
// this gate (never rejected as "exceeds"), proven by reaching cost
// computation next (a misconfigured zero price surfaces a DIFFERENT,
// later-stage rejection).
func TestRefuelService_Scenario_ExactlyFreeHoldIsNotRejected(t *testing.T) {
	f := dockedFleet("corp-real", map[string]float64{"fuel": 195})
	fs := &fakeFleetSource{t: t, fleet: f}
	params := fleet.DefaultFuelParams()
	params.PricePerTon = 0 // forces a later, distinguishable rejection if this gate clears
	svc := NewService(params, fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 5, OperationKey: validOpKey("exact-free-hold")})
	if errors.Is(err, ErrExceedsFreeHold) {
		t.Error("requesting exactly the free hold was rejected as exceeding it")
	}
	if !errors.Is(err, ErrMisconfiguredPrice) {
		t.Errorf("err = %v, want ErrMisconfiguredPrice (proving free hold cleared and cost computation ran)", err)
	}
}

// --- Cost Arithmetic Rounds Against the Buyer, Is Overflow-Safe -----------

// TestRefuelService_Scenario_CostComputedOnlyAfterFreeHoldValidated pins the
// spec's explicit ordering: "cost is never computed from a not-yet-
// validated tonnage" — an over-free-hold request with a simultaneously
// misconfigured price must still report ErrExceedsFreeHold, never a cost
// error, because free hold is checked strictly before cost is computed.
func TestRefuelService_Scenario_CostComputedOnlyAfterFreeHoldValidated(t *testing.T) {
	f := dockedFleet("corp-real", map[string]float64{"fuel": 195})
	fs := &fakeFleetSource{t: t, fleet: f}
	params := fleet.DefaultFuelParams()
	params.PricePerTon = 0 // would itself reject, but free hold must reject FIRST
	svc := NewService(params, fs, &fakeCreditSource{t: t}, common.WorldClock(), nil)

	err := rejectionOnly(t, svc, "corp-real", "fleet-x", Request{Tons: 10, OperationKey: validOpKey("order")})
	if !errors.Is(err, ErrExceedsFreeHold) {
		t.Errorf("err = %v, want ErrExceedsFreeHold (free hold must be validated before cost is ever computed)", err)
	}
}

func TestComputeCost_Scenario_FractionalCostRoundsUpAgainstTheBuyer(t *testing.T) {
	cases := []struct {
		tons, price float64
		want        int64
	}{
		{tons: 3, price: 2.5, want: 8},  // 7.5 -> 8, never 7
		{tons: 1, price: 0.01, want: 1}, // 0.01 -> 1
		{tons: 4, price: 2, want: 8},    // exact integer stays exact, never bumped up an extra credit
		{tons: 10, price: 10.0001, want: 101},
	}
	for _, c := range cases {
		got, err := computeCost(c.tons, c.price)
		if err != nil {
			t.Fatalf("computeCost(%v, %v): unexpected error %v", c.tons, c.price, err)
		}
		if got != c.want {
			t.Errorf("computeCost(%v, %v) = %d, want %d", c.tons, c.price, got, c.want)
		}
	}
}

func TestComputeCost_Scenario_MisconfiguredNonPositivePriceRejectsEveryRequest(t *testing.T) {
	cases := map[string]float64{
		"zero":     0,
		"negative": -5,
		"NaN":      math.NaN(),
		"+Inf":     math.Inf(1),
		"-Inf":     math.Inf(-1),
	}
	for name, price := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := computeCost(10, price)
			if !errors.Is(err, ErrMisconfiguredPrice) {
				t.Errorf("price=%v: err = %v, want ErrMisconfiguredPrice", price, err)
			}
		})
	}
}

func TestComputeCost_Scenario_OverflowingCostIsRejectedNotWrapped(t *testing.T) {
	_, err := computeCost(10, math.MaxFloat64/5)
	if !errors.Is(err, ErrCostOverflow) {
		t.Errorf("err = %v, want ErrCostOverflow for a price that overflows a bounded tonnage", err)
	}

	// A non-finite intermediate (tons itself infinite) must ALSO reject as
	// overflow, not panic or silently produce a garbage cost — defensive
	// coverage of computeCost as a standalone function, even though the
	// live call site already validates tons finite before calling it.
	_, err = computeCost(math.Inf(1), 10)
	if !errors.Is(err, ErrCostOverflow) {
		t.Errorf("err = %v, want ErrCostOverflow for a non-finite tons intermediate", err)
	}
}

// TestComputeCost_Scenario_OverflowBoundaryIsExactlyAtHalfMaxInt64 is an
// SDET-added ±1 boundary probe on computeCost's own documented threshold
// (raw > float64(math.MaxInt64)/2).
func TestComputeCost_Scenario_OverflowBoundaryIsExactlyAtHalfMaxInt64(t *testing.T) {
	boundary := float64(math.MaxInt64) / 2
	justUnder := boundary * 0.999999
	justOver := boundary * 1.000001

	if _, err := computeCost(1, justUnder); err != nil {
		t.Errorf("just under the overflow boundary: unexpected error %v", err)
	}
	if _, err := computeCost(1, justOver); !errors.Is(err, ErrCostOverflow) {
		t.Errorf("just over the overflow boundary: err = %v, want ErrCostOverflow", err)
	}
}

// TestComputeCost_Scenario_RejectZeroGuardIsUnreachableUnderAValidConfig
// samples a spread of positive tons/price combinations well within a
// legitimate configuration's range and asserts the rounded-up cost is
// ALWAYS at least one whole credit — pinning the spec's own claim that
// ErrZeroCost is a misconfiguration guard, never a live gameplay path.
func TestComputeCost_Scenario_RejectZeroGuardIsUnreachableUnderAValidConfig(t *testing.T) {
	tonsSamples := []float64{1e-9, 1e-6, 0.001, 1, 10, 200, 1e6}
	priceSamples := []float64{1e-9, 1e-6, 0.01, 1, 10, 1000}
	for _, tons := range tonsSamples {
		for _, price := range priceSamples {
			got, err := computeCost(tons, price)
			if err != nil {
				// Some combinations legitimately overflow at these extremes;
				// that is a DIFFERENT guard (ErrCostOverflow), not the one
				// under test here.
				if !errors.Is(err, ErrCostOverflow) {
					t.Errorf("computeCost(%v, %v): unexpected error %v", tons, price, err)
				}
				continue
			}
			if got < 1 {
				t.Errorf("computeCost(%v, %v) = %d, want >= 1 for any positive tons and price", tons, price, got)
			}
		}
	}
}

// --- Instant, Not an Action --------------------------------------------

func TestRefuelService_Scenario_PricePerTonServesTheConfiguredConstant(t *testing.T) {
	svc := NewService(fleet.FuelParams{PricePerTon: 7.5}, nil, nil, nil, nil)
	if got := svc.PricePerTon(); got != 7.5 {
		t.Errorf("PricePerTon() = %v, want 7.5", got)
	}
}

// =============================================================================
// Part 2 — integration level, real Firestore emulator: the seams only a real
// two-phase transaction can pin (atomicity, idempotent replay, conflict
// detection, all-or-nothing affordability) — exercised by calling
// Service.Refuel directly, never through HTTP (the root e2e suite already
// covers this capability end-to-end through the router; this section pins
// the SAME transactional seam one layer down, which is what a request/
// response round trip cannot isolate).
// =============================================================================

type refuelStack struct {
	svc     *Service
	fleets  *fleet.Service
	client  *firestore.Client
	corpID  string
	fleetID string
	ctx     context.Context
}

func newRefuelStack(t *testing.T, startingCargo map[string]float64, pricePerTon float64, startingCredits int64) (*refuelStack, func()) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := common.WorldClock()

	// bodies/graph/actions are nil: a static, already-docked (Parked) fleet
	// with no active action and no jump never dereferences any of the
	// three (fleet.Service.Get's own branches only touch them on a due
	// burn/jump, neither of which this fixture ever constructs).
	fsvc := fleet.NewServiceWith(fleet.NewDaoWithClient(fs), nil, nil, nil, clk)
	credits := corporations.NewCreditStoreWith(fs)
	svc := NewService(fleet.FuelParams{PricePerTon: pricePerTon}, fsvc, credits, clk, fs)

	corpID := "corp-refuel-" + t.Name()
	if _, err := client.Collection("corporations").Doc(corpID).Set(ctx, corporations.Corporation{
		Id: corpID, AccountId: "acct-refuel", Name: "Refueler", CreatedAt: 1000, Credits: 0,
	}); err != nil {
		t.Fatalf("seeding corporation: %v", err)
	}
	if startingCredits != 0 {
		if _, err := credits.ApplyCredit(ctx, corpID, validOpKey("stack-grant-"+t.Name()), corporations.LedgerEntry{
			AccountId: "acct-refuel", Kind: corporations.EntryStartingGrant, Amount: startingCredits,
		}, clk.Now()); err != nil {
			t.Fatalf("seeding balance: %v", err)
		}
	}

	fleetID := "fleet-refuel-" + t.Name()
	dockedState := fleet.EncodeKinematicState(space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{}},
	})
	if _, err := client.Collection("fleets").Doc(fleetID).Set(ctx, fleet.Fleet{
		Id: fleetID, CorporationId: corpID, SystemId: "sys-refuel",
		StateDoc:   dockedState,
		AttachedTo: stations.StationFeatureId,
		Ships:      []fleet.ShipEntry{{Class: fleet.ClassSeed}},
		Cargo:      startingCargo,
	}); err != nil {
		t.Fatalf("seeding fleet: %v", err)
	}

	s := &refuelStack{svc: svc, fleets: fsvc, client: client, corpID: corpID, fleetID: fleetID, ctx: ctx}
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client, "fleets", "corporations")
	}
	return s, cleanup
}

func (s *refuelStack) refuel(tons float64, opKey string) (*Result, error) {
	return s.svc.Refuel(s.ctx, "acct-refuel", s.corpID, s.fleetID, Request{Tons: tons, OperationKey: opKey})
}

func (s *refuelStack) balance(t *testing.T) int64 {
	t.Helper()
	snap, err := s.client.Collection("corporations").Doc(s.corpID).Get(s.ctx)
	if err != nil {
		t.Fatalf("reading balance: %v", err)
	}
	var c corporations.Corporation
	if err := snap.DataTo(&c); err != nil {
		t.Fatalf("decoding corporation: %v", err)
	}
	return c.Credits
}

func (s *refuelStack) fuelCargo(t *testing.T) float64 {
	t.Helper()
	f, err := s.fleets.Get(s.ctx, s.fleetID)
	if err != nil {
		t.Fatalf("reading fleet: %v", err)
	}
	return f.Cargo["fuel"]
}

func (s *refuelStack) ledgerEntry(t *testing.T, opKey string) corporations.LedgerEntry {
	t.Helper()
	snap, err := s.client.Collection("corporations").Doc(s.corpID).Collection("ledger").Doc(opKey).Get(s.ctx)
	if err != nil {
		t.Fatalf("reading ledger entry %s: %v", opKey, err)
	}
	var e corporations.LedgerEntry
	if err := snap.DataTo(&e); err != nil {
		t.Fatalf("decoding ledger entry: %v", err)
	}
	return e
}

// --- One Atomic Transaction — Credit Debit and Fuel Credit -----------------

func TestRefuelService_Scenario_SettledRefuelLandsBothEffectsTogether(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 1000)
	defer cleanup()

	res, err := stack.refuel(5, validOpKey("happy"))
	if err != nil {
		t.Fatalf("Refuel: %v", err)
	}
	if res.Cost != 50 {
		t.Errorf("Cost = %d, want 50 (5 tons * 10/ton)", res.Cost)
	}
	if got := stack.fuelCargo(t); got != 5 {
		t.Errorf("fuel cargo = %v, want exactly 5 (all-or-nothing full fill)", got)
	}
	if got := stack.balance(t); got != 950 {
		t.Errorf("balance = %d, want 950 (1000 - 50)", got)
	}
	entry := stack.ledgerEntry(t, validOpKey("happy"))
	if entry.Amount != -50 {
		t.Errorf("ledger amount = %d, want -50 (a refuel is a debit)", entry.Amount)
	}
	if entry.Kind != corporations.EntryFuelPurchase {
		t.Errorf("ledger kind = %q, want %q", entry.Kind, corporations.EntryFuelPurchase)
	}
	if entry.FleetId != stack.fleetID {
		t.Errorf("ledger fleetId = %q, want %q", entry.FleetId, stack.fleetID)
	}
}

// --- Idempotent By Operation Key --------------------------------------------

func TestRefuelService_Scenario_RetriedOperationKeyIsANoOp(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 1000)
	defer cleanup()
	key := validOpKey("retry")

	first, err := stack.refuel(5, key)
	if err != nil {
		t.Fatalf("first Refuel: %v", err)
	}
	second, err := stack.refuel(5, key)
	if err != nil {
		t.Fatalf("retried Refuel: %v", err)
	}
	if second.Cost != first.Cost || second.Balance != first.Balance {
		t.Errorf("retry result = %+v, want identical to first %+v", second, first)
	}
	if got := stack.fuelCargo(t); got != 5 {
		t.Errorf("fuel cargo after retry = %v, want 5 (no double credit)", got)
	}
	if got := stack.balance(t); got != 950 {
		t.Errorf("balance after retry = %d, want 950 (no double debit)", got)
	}
}

func TestRefuelService_Scenario_ReusedKeyDifferentTonnageIsAConflict(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 1000)
	defer cleanup()
	key := validOpKey("conflict")

	if _, err := stack.refuel(5, key); err != nil {
		t.Fatalf("first Refuel: %v", err)
	}
	_, err := stack.refuel(6, key) // same key, different tonnage
	if !errors.Is(err, corporations.ErrOperationConflict) {
		t.Errorf("err = %v, want ErrOperationConflict", err)
	}
	if got := stack.fuelCargo(t); got != 5 {
		t.Errorf("fuel cargo after conflicting retry = %v, want unchanged at 5", got)
	}
	if got := stack.balance(t); got != 950 {
		t.Errorf("balance after conflicting retry = %d, want unchanged at 950", got)
	}
}

// --- Refuel Is All-Or-Nothing, Never Partially Filled -----------------------

func TestRefuelService_Scenario_UnaffordableRequestIsRejectedInFullNeverReduced(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 10 /* balance affords only 1 ton */)
	defer cleanup()

	_, err := stack.refuel(5 /* costs 50 */, validOpKey("unaffordable"))
	if !errors.Is(err, corporations.ErrInsufficientCredits) {
		t.Errorf("err = %v, want ErrInsufficientCredits", err)
	}
	if got := stack.fuelCargo(t); got != 0 {
		t.Errorf("fuel cargo = %v, want 0 (no partial tonnage credited)", got)
	}
	if got := stack.balance(t); got != 10 {
		t.Errorf("balance = %d, want unchanged at 10 (no partial debit)", got)
	}
}

func TestRefuelService_Scenario_AffordableRequestFillsFullRequestedTonnage(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 50 /* exactly affords 5 tons */)
	defer cleanup()

	res, err := stack.refuel(5, validOpKey("exact-afford"))
	if err != nil {
		t.Fatalf("Refuel: %v", err)
	}
	if res.Cost != 50 {
		t.Errorf("Cost = %d, want 50", res.Cost)
	}
	if got := stack.fuelCargo(t); got != 5 {
		t.Errorf("fuel cargo = %v, want the full 5 tons requested", got)
	}
	if got := stack.balance(t); got != 0 {
		t.Errorf("balance = %d, want exactly 0", got)
	}
}

// --- A Single Global Fuel Price, Unlimited Station Supply -------------------

func TestRefuelService_Scenario_RepeatedRefuelsNeverExhaustSupplyAndAllSettleOnIdenticalTerms(t *testing.T) {
	stack, cleanup := newRefuelStack(t, map[string]float64{}, 10, 100_000)
	defer cleanup()

	var totalFuel, totalCost float64
	for i := 0; i < 5; i++ {
		res, err := stack.refuel(3, validOpKey(fmt.Sprintf("repeat-%d", i)))
		if err != nil {
			t.Fatalf("refuel #%d: %v", i, err)
		}
		if res.Cost != 30 {
			t.Errorf("refuel #%d: cost = %d, want 30 on identical terms every time", i, res.Cost)
		}
		totalFuel += 3
		totalCost += float64(res.Cost)
	}
	if got := stack.fuelCargo(t); got != totalFuel {
		t.Errorf("fuel cargo = %v, want %v across %v settlements", got, totalFuel, totalFuel/3)
	}
	if got := stack.balance(t); got != 100_000-int64(totalCost) {
		t.Errorf("balance = %d, want %d", got, 100_000-int64(totalCost))
	}
}
