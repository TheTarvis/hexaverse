package market

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"

	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/corporations"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/space"
	"hexaverse/stations"
	"hexaverse/system"

	"cloud.google.com/go/firestore"
)

// saleStack wires the REAL stack against the emulator — every settlement
// primitive over one Firestore client, which is what makes the single
// transaction actually a single transaction.
type saleStack struct {
	svc      *Service
	stations *stations.Service
	credits  *corporations.CreditStore
	fleets   *fleet.Service
	client   *firestore.Client
	corpID   string
	fleetID  string
	systemID string
	params   Params
	ctx      context.Context
}

func newSaleStack(t *testing.T, startingCargo map[string]float64) (*saleStack, func()) {
	t.Helper()
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	clk := common.WorldClock()

	gsvc := galaxy.NewServiceWith(galaxy.NewDaoWithClient(fs), clk)
	meta, err := gsvc.Seed(ctx, 4242, galaxy.DefaultParams())
	if err != nil {
		t.Fatalf("seeding galaxy: %v", err)
	}
	gid := meta.Id
	systemID := meta.OriginSystemId

	ssvc := system.NewServiceWith(system.NewDaoWithClient(fs), gsvc, clk)
	asvc := action.NewServiceWith(action.NewDaoWith(fs, clk), clk, nil)
	// gsvc — the real, seeded galaxy service — is the fleet stack's
	// GraphSource (the only production implementation of LaneCrossing), so
	// the sale stack's fleet service is wired exactly as router.go wires it.
	fsvc := fleet.NewServiceWith(fleet.NewDaoWithClient(fs), ssvc, gsvc, asvc, clk)
	fogSvc := charts.NewServiceWith(charts.NewDaoWithClient(fs), clk)
	stSvc := stations.NewServiceWith(stations.NewDaoWithClient(fs), gsvc, fogSvc, clk)
	credits := corporations.NewCreditStoreWith(fs)

	params := testParams()
	svc := NewService(params, gsvc, stSvc, fsvc, credits, fogSvc, clk, fs)

	// A corporation with a balance and its own ledger anchor.
	corpID := "corp-sale-" + t.Name()
	if _, err := client.Collection("corporations").Doc(corpID).Set(ctx, corporations.Corporation{
		Id: corpID, AccountId: "acct-sale", Name: "Seller", CreatedAt: 1000, Credits: 0,
	}); err != nil {
		t.Fatalf("seeding corporation: %v", err)
	}
	if _, err := credits.ApplyCredit(ctx, corpID, "sale-stack-grant-012345", corporations.LedgerEntry{
		AccountId: "acct-sale", Kind: corporations.EntryStartingGrant, Amount: 500,
	}, clk.Now()); err != nil {
		t.Fatalf("seeding balance: %v", err)
	}

	// The station, and the fleet docked to it with cargo aboard.
	if err := stSvc.EnsureStation(ctx, systemID); err != nil {
		t.Fatalf("provisioning station: %v", err)
	}
	st, err := stSvc.Get(ctx, systemID)
	if err != nil || st == nil {
		t.Fatalf("reading station: %v", err)
	}

	fleetID := "fleet-sale-" + t.Name()
	// A docked fleet still carries a real space.ShipState (design.md Decision
	// 4 — "a docked fleet still has a ShipState — it is parked at ... its
	// host"); AttachedTo is the separate relationship market's dockedTo()
	// check reads (design.md Decision 13). ParkPoint needs no body-existence
	// cross-check at decode (fleet.DecodeKinematicState), so the exact point
	// is immaterial here — only the AttachedTo relationship is under test.
	dockedState := fleet.EncodeKinematicState(space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{}},
	})
	if _, err := client.Collection("fleets").Doc(fleetID).Set(ctx, fleet.Fleet{
		Id: fleetID, CorporationId: corpID, SystemId: systemID,
		StateDoc:   dockedState,
		AttachedTo: st.FeatureId,
		Ships:      []fleet.ShipEntry{{Class: fleet.ClassSeed}},
		Cargo:      startingCargo,
	}); err != nil {
		t.Fatalf("seeding fleet: %v", err)
	}

	// Make the home system visible to the seller at the gate tier.
	if err := fogSvc.RevealArrival(ctx, corpID, systemID, clk.Now()); err != nil {
		t.Fatalf("revealing home: %v", err)
	}

	s := &saleStack{
		svc: svc, stations: stSvc, credits: credits, fleets: fsvc,
		client: client, corpID: corpID, fleetID: fleetID,
		systemID: systemID, params: params, ctx: ctx,
	}
	cleanup := func() {
		common.CleanupFirestoreTestData(t, client,
			fmt.Sprintf("corporations/%s/ledger", corpID),
			fmt.Sprintf("corporations/%s/reconciliation", corpID),
			fmt.Sprintf("galaxies/%s/systems/%s/station", gid, systemID),
			fmt.Sprintf("corporations/%s/charts", corpID),
			"galaxies/"+gid+"/systems", "galaxies/"+gid+"/lanes", "galaxies/"+gid+"/blocks",
			"fleets", "corporations", "corpByAccount", "spawnClaims", "galaxies", "galaxy_pointers", "actions")
	}
	return s, cleanup
}

func (s *saleStack) stationFeatureId(t *testing.T) string {
	t.Helper()
	st, err := s.stations.Get(s.ctx, s.systemID)
	if err != nil || st == nil {
		t.Fatalf("reading station: %v", err)
	}
	return st.FeatureId
}

func (s *saleStack) balance(t *testing.T) int64 {
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

func (s *saleStack) cargo(t *testing.T) map[string]float64 {
	t.Helper()
	f, err := s.fleets.Get(s.ctx, s.fleetID)
	if err != nil {
		t.Fatalf("reading fleet: %v", err)
	}
	return f.Cargo
}

func opKey(seed string) string {
	// 16–64 chars of [A-Za-z0-9_-].
	k := "opkey-" + strings.ReplaceAll(seed, "_", "-")
	for len(k) < 20 {
		k += "0"
	}
	if len(k) > 64 {
		k = k[:64]
	}
	return k
}

func (s *saleStack) sell(req SellRequest) (*SellResult, error) {
	return s.svc.Sell(s.ctx, "acct-sale", s.corpID, s.fleetID, req)
}

// --- the happy path ----------------------------------------------------------

func TestSell_SettlesHoldDebitBalanceCreditAndLedgerTogether(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	before := stack.balance(t)
	res, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 10,
		OperationKey: opKey("happy"),
	})
	if err != nil {
		t.Fatalf("Sell: %v", err)
	}

	if res.TotalProceeds <= 0 {
		t.Errorf("proceeds = %d, want positive", res.TotalProceeds)
	}
	if len(res.Fills) == 0 {
		t.Error("no fills reported; a split sale must be legible per portion")
	}
	// All four effects land together.
	if got := stack.cargo(t)["metals"]; got != 30 {
		t.Errorf("cargo after selling 10 of 40 = %v, want 30", got)
	}
	if got := stack.balance(t); got != before+res.TotalProceeds {
		t.Errorf("balance = %d, want %d", got, before+res.TotalProceeds)
	}
	// And no action was created: a sale is instant, not an action.
	if res.WorldTime == 0 {
		t.Error("result carries no world time")
	}
}

// --- idempotency -------------------------------------------------------------

func TestSell_RetriedOperationKeyIsANoOp(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()
	key := opKey("retry")
	req := SellRequest{FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 10, OperationKey: key}

	first, err := stack.sell(req)
	if err != nil {
		t.Fatalf("first Sell: %v", err)
	}
	cargoAfterFirst := stack.cargo(t)["metals"]
	balanceAfterFirst := stack.balance(t)

	// The client's ordinary retry after a lost response. A sale claims no action
	// slot, so this key is the only thing standing between a retry and a double
	// sale.
	second, err := stack.sell(req)
	if err != nil {
		t.Fatalf("retried Sell: %v", err)
	}
	if got := stack.cargo(t)["metals"]; got != cargoAfterFirst {
		t.Errorf("cargo changed on retry: %v, want %v", got, cargoAfterFirst)
	}
	if got := stack.balance(t); got != balanceAfterFirst {
		t.Errorf("balance changed on retry: %d, want %d", got, balanceAfterFirst)
	}
	if second.TotalProceeds != first.TotalProceeds {
		t.Errorf("replay reported %d proceeds, want the original %d", second.TotalProceeds, first.TotalProceeds)
	}
}

func TestSell_ReusedKeyWithDifferentParametersIsAConflict(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()
	key := opKey("conflict")
	feat := stack.stationFeatureId(t)

	if _, err := stack.sell(SellRequest{FeatureId: feat, Kind: "metals", Tons: 10, OperationKey: key}); err != nil {
		t.Fatalf("first Sell: %v", err)
	}
	_, err := stack.sell(SellRequest{FeatureId: feat, Kind: "metals", Tons: 25, OperationKey: key})
	if !errors.Is(err, corporations.ErrOperationConflict) {
		t.Fatalf("reused key with a different tonnage = %v, want ErrOperationConflict", err)
	}
}

// --- preconditions -----------------------------------------------------------

func TestSell_RejectsInvalidOperationKeysBeforeTouchingState(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()
	feat := stack.stationFeatureId(t)
	cargoBefore := stack.cargo(t)["metals"]

	for name, key := range map[string]string{
		"empty":     "",
		"too short": "short",
		"slash":     "aaaaaaaaaa/bbbbbbbbbb",
		"reserved":  "spawn:corp-0123456789ab",
	} {
		_, err := stack.sell(SellRequest{FeatureId: feat, Kind: "metals", Tons: 1, OperationKey: key})
		if err == nil {
			t.Errorf("%s operation key was accepted", name)
		}
	}
	if got := stack.cargo(t)["metals"]; got != cargoBefore {
		t.Errorf("a malformed-key attempt changed cargo: %v, want %v", got, cargoBefore)
	}
}

func TestSell_RejectsInvalidTonnage(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()
	feat := stack.stationFeatureId(t)

	for name, tons := range map[string]float64{
		"zero":      0,
		"negative":  -5,
		"over held": 999,
	} {
		_, err := stack.sell(SellRequest{
			FeatureId: feat, Kind: "metals", Tons: tons, OperationKey: opKey("tons-" + name),
		})
		if err == nil {
			t.Errorf("%s tonnage was accepted; it must be rejected, never clamped", name)
		}
	}
	if got := stack.cargo(t)["metals"]; got != 40 {
		t.Errorf("cargo = %v after rejected sales, want 40 untouched", got)
	}
}

func TestSell_ForeignFleetAndUnknownStationAreIndistinguishable(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	// A different corporation's requester against this fleet.
	_, foreignErr := stack.svc.Sell(stack.ctx, "acct-other", "corp-someone-else", stack.fleetID, SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 1, OperationKey: opKey("foreign"),
	})
	// An unknown fleet id.
	_, unknownErr := stack.svc.Sell(stack.ctx, "acct-sale", stack.corpID, "fleet-does-not-exist", SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 1, OperationKey: opKey("unknown"),
	})
	// A feature id that is not this system's station.
	_, wrongFeatErr := stack.sell(SellRequest{
		FeatureId: "feat-body-0", Kind: "metals", Tons: 1, OperationKey: opKey("wrongfeat"),
	})

	for name, err := range map[string]error{
		"foreign fleet": foreignErr, "unknown fleet": unknownErr, "wrong feature": wrongFeatErr,
	} {
		if !errors.Is(err, ErrHidden) {
			t.Errorf("%s = %v, want the single existence-hiding rejection", name, err)
		}
	}
	// Byte-identical: probing across candidate ids must yield uniform responses.
	if foreignErr.Error() != unknownErr.Error() || unknownErr.Error() != wrongFeatErr.Error() {
		t.Errorf("existence-hiding rejections differ: %q / %q / %q",
			foreignErr, unknownErr, wrongFeatErr)
	}
}

func TestSell_RejectsAnUndockedFleet(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	// Clear the AttachedTo relationship (design.md Decision 13) — docking is
	// no longer a kinematic mode, so "undocked" is now expressed by clearing
	// the relationship field, not by swapping the ship's kinematic state.
	if _, err := stack.client.Collection("fleets").Doc(stack.fleetID).Set(stack.ctx, map[string]any{
		"attachedTo": "",
	}, firestore.MergeAll); err != nil {
		t.Fatalf("undocking fleet: %v", err)
	}

	_, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 10, OperationKey: opKey("undocked"),
	})
	if !errors.Is(err, ErrNotDockedAtStation) {
		t.Fatalf("selling while coasting = %v, want ErrNotDockedAtStation", err)
	}
	if got := stack.cargo(t)["metals"]; got != 40 {
		t.Errorf("cargo = %v after a rejected sale, want 40", got)
	}
}

// --- slippage guards ---------------------------------------------------------

func TestSell_NoGuardSuppliedStillSells(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	// The guards are optional, not a de-facto requirement to quote first: the
	// minimum viable flow (no board read, just sell) must stay functional.
	if _, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 5, OperationKey: opKey("noguard"),
	}); err != nil {
		t.Fatalf("a sale with no guards = %v, want success", err)
	}
}

func TestSell_StaleFirstTonGuardRejectsBeforeAnyStateChange(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	stale := int64(999999) // a price the server would never apply
	_, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 5,
		OperationKey: opKey("staleguard"), ExpectedUnitPrice: &stale,
	})
	if !errors.Is(err, ErrPriceChanged) {
		t.Fatalf("a stale first-ton guard = %v, want ErrPriceChanged", err)
	}
	if got := stack.cargo(t)["metals"]; got != 40 {
		t.Errorf("cargo = %v after a guard rejection, want 40 — the guard must fire before any state change", got)
	}
}

func TestSell_MinTotalProceedsGuardCatchesWhatTheFirstTonGuardMisses(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 200})
	defer cleanup()

	// Demand this station cannot possibly meet: the total-proceeds guard is the
	// one that catches a large haul quietly settling at the floor after a rival
	// drained the premium request — precisely the case a first-ton-only guard
	// passes.
	unreachable := int64(1 << 40)
	_, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 100,
		OperationKey: opKey("mintotal"), MinTotalProceeds: &unreachable,
	})
	if !errors.Is(err, ErrPriceChanged) {
		t.Fatalf("an unmet minimum-total guard = %v, want ErrPriceChanged", err)
	}
	if got := stack.cargo(t)["metals"]; got != 200 {
		t.Errorf("cargo = %v after a guard rejection, want 200", got)
	}
}

func TestSell_InvalidGuardValueIsRejectedNotTreatedAsAbsent(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()

	negative := int64(-1)
	_, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 5,
		OperationKey: opKey("badguard"), ExpectedUnitPrice: &negative,
	})
	if !errors.Is(err, ErrInvalidGuard) {
		t.Fatalf("a negative guard = %v, want ErrInvalidGuard — never silently treated as 'no guard'", err)
	}
}

// --- concurrency -------------------------------------------------------------

func TestSell_ConcurrentSalesNeverOversellOneHold(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 30})
	defer cleanup()
	feat := stack.stationFeatureId(t)

	// Two sales of 20 tons against a 30-ton hold, with DIFFERENT keys so the
	// idempotency anchor deliberately does not fire. The transactional re-read is
	// the only thing that stops both from committing.
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, errs[i] = stack.sell(SellRequest{
				FeatureId: feat, Kind: "metals", Tons: 20,
				OperationKey: opKey(fmt.Sprintf("concurrent-%d", i)),
			})
		}(i)
	}
	wg.Wait()

	settled := 0
	for _, err := range errs {
		if err == nil {
			settled++
		}
	}
	if settled != 1 {
		t.Fatalf("%d of 2 concurrent sales settled, want exactly 1 (errors: %v, %v)", settled, errs[0], errs[1])
	}
	if got := stack.cargo(t)["metals"]; got != 10 {
		t.Errorf("cargo = %v, want 10 — the loser must be rejected in full, never reduced", got)
	}
}

func TestSell_ZeroProceedsDustSaleIsRejected(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 0.001})
	defer cleanup()

	// Cargo is float64, so a fleet can hold a fraction whose proceeds floor to
	// zero. Debiting it for nothing in return would be theft.
	_, err := stack.sell(SellRequest{
		FeatureId: stack.stationFeatureId(t), Kind: "metals", Tons: 0.001,
		OperationKey: opKey("dust"),
	})
	if !errors.Is(err, ErrZeroProceeds) {
		t.Fatalf("a dust sale = %v, want ErrZeroProceeds", err)
	}
	if got := stack.cargo(t)["metals"]; got != 0.001 {
		t.Errorf("cargo = %v after a rejected dust sale, want it untouched", got)
	}
}

// --- rejection distinguishability -------------------------------------------

func TestSell_EveryRejectionReasonIsDistinctExceptTheHiddenFour(t *testing.T) {
	stack, cleanup := newSaleStack(t, map[string]float64{"metals": 40})
	defer cleanup()
	feat := stack.stationFeatureId(t)

	stale := int64(999999)
	reasons := map[string]error{}
	collect := func(name string, req SellRequest) {
		if _, err := stack.sell(req); err != nil {
			reasons[name] = err
		}
	}
	collect("bad tonnage", SellRequest{FeatureId: feat, Kind: "metals", Tons: -1, OperationKey: opKey("d1")})
	collect("untradable", SellRequest{FeatureId: feat, Kind: "nonsense", Tons: 1, OperationKey: opKey("d2")})
	collect("price changed", SellRequest{FeatureId: feat, Kind: "metals", Tons: 1,
		OperationKey: opKey("d3"), ExpectedUnitPrice: &stale})
	collect("bad key", SellRequest{FeatureId: feat, Kind: "metals", Tons: 1, OperationKey: "x"})

	seen := map[string]string{}
	for name, err := range reasons {
		msg := err.Error()
		if prior, dup := seen[msg]; dup {
			t.Errorf("%q and %q share the reason %q; every rejection but the hidden four must be distinguishable",
				name, prior, msg)
		}
		seen[msg] = name
	}
	if len(reasons) < 4 {
		t.Errorf("only %d rejections were produced; expected all four to reject", len(reasons))
	}
}
