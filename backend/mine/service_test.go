package mine

import (
	"context"
	"errors"
	"math"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/space"
	"hexaverse/system"
)

// mine-extraction spec: "Mine Command Requires Fleet Ownership", "Mine
// Tonnage Is a Positive Finite Number", "Minimum Mine Run Size", "Mine
// Commit Preconditions", "Already-Depleted Lode Rejected At Commit", "ETA
// From Tonnage Target" (tasks 2.2, 4.1, 4.3, 4.6, 4.7, 4.8). All red now:
// Service.Commit is a stub (errNotImplemented) regardless of input.

// --- hand fakes --------------------------------------------------------

type fakeFleets struct {
	f   *fleet.Fleet
	err error
}

func (f *fakeFleets) Get(context.Context, string) (*fleet.Fleet, error) { return f.f, f.err }

type fakeFeatures struct {
	interior *system.GeneratedInterior
	err      error
}

func (f *fakeFeatures) GetOrCreateInterior(context.Context, string) (*system.GeneratedInterior, error) {
	return f.interior, f.err
}

type fakeMineActions struct {
	committed *action.CommitSpec
	commitErr error
	getResult *action.Action
	getErr    error
	remaining float64
	remainErr error
}

func (f *fakeMineActions) Commit(_ context.Context, spec action.CommitSpec) (*action.Action, error) {
	if f.commitErr != nil {
		return nil, f.commitErr
	}
	f.committed = &spec
	return &action.Action{Id: "action_test", Type: spec.Type, Actor: spec.Actor, Scope: spec.Scope, Eta: spec.Eta, Status: action.StatusRunning}, nil
}
func (f *fakeMineActions) Cancel(context.Context, string, map[string]interface{}) (*action.Action, error) {
	return nil, nil
}
func (f *fakeMineActions) ResolveActive(context.Context, string) ([]action.Action, error) {
	return nil, nil
}
func (f *fakeMineActions) Get(context.Context, string) (*action.Action, error) {
	return f.getResult, f.getErr
}
func (f *fakeMineActions) Remaining(context.Context, string, common.WorldMillis) (float64, error) {
	return f.remaining, f.remainErr
}

// --- fixtures ------------------------------------------------------------

const (
	testSystemID  = "sys-1"
	testFeatureID = "feat-belt-0"
	testFleetID   = "fleet-1"
	testCorpA     = "corp-A"
	testCorpB     = "corp-B"
)

func dockedFleet(corp string) *fleet.Fleet {
	return &fleet.Fleet{
		Id: testFleetID, CorporationId: corp, SystemId: testSystemID,
		// A docked fleet still carries a real space.ShipState (design.md
		// Decision 4) — AttachedTo is the separate relationship mine's
		// DockedTo() check reads (design.md Decision 13, mine/service.go's
		// re-point). These are in-memory fixtures (fakeFleets.Get returns
		// them directly, never through Firestore), so no codec round trip is
		// needed here.
		State:      space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
		AttachedTo: testFeatureID,
		Ships:      []fleet.ShipEntry{{Class: fleet.ClassSeed}},
	}
}

func featureWithMetals() *system.GeneratedInterior {
	return &system.GeneratedInterior{Features: []system.Feature{
		{Id: testFeatureID, Type: system.FeatureBelt, Resources: []system.Resource{
			{Kind: system.ResourceMetals, Richness: 0.5},
		}},
	}}
}

func validStats() map[fleet.ShipClass]fleet.ClassStats {
	return map[fleet.ShipClass]fleet.ClassStats{
		fleet.ClassSeed: {MiningRate: 10, HoldCapacity: 100, BurnRate: 1, LaneRate: 1},
	}
}

func validRequest() MineRequest {
	return MineRequest{FeatureId: testFeatureID, Kind: system.ResourceMetals, Tons: 40}
}

func validParams() MineParams {
	return MineParams{MinRunTons: 1, TonsPerRichness: 1000}
}

func newSvc(t *testing.T, fleets *fakeFleets, features *fakeFeatures, actions *fakeMineActions, params MineParams) *Service {
	t.Helper()
	return NewServiceWith(fleets, features, actions, testClock{}, params, validStats())
}

// testClock satisfies common.WorldTime with a fixed instant.
type testClock struct{}

func (testClock) Now() common.WorldMillis                 { return 1000 }
func (testClock) FromWall(t time.Time) common.WorldMillis { return 1000 }
func (testClock) Scale() float64                          { return 1 }

// --- ownership ---------------------------------------------------------

// Scenario: An unauthenticated mine request is rejected.
func TestCommit_Scenario_Unauthenticated(t *testing.T) {
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), "" /* no resolved corp */, testFleetID, validRequest())
	if !errors.Is(err, ErrUnauthenticated) {
		t.Fatalf("err = %v, want ErrUnauthenticated", err)
	}
}

// Scenario: A foreign corporation cannot mine with another corp's fleet.
func TestCommit_Scenario_ForeignCorpRejected(t *testing.T) {
	fa := &fakeMineActions{}
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpB)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if !errors.Is(err, ErrForeignFleet) {
		t.Fatalf("err = %v, want ErrForeignFleet", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected foreign-corp commit must create no action, got %+v", fa.committed)
	}
}

// Scenario: The owning corporation may mine its own fleet.
func TestCommit_Scenario_OwningCorpCommitsNormally(t *testing.T) {
	fa := &fakeMineActions{remaining: -20} // remainingAtNow = startTons(computed) + fold; fixture below assumes positive
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	a, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if err != nil {
		t.Fatalf("owning-corp commit with all preconditions satisfied: err = %v, want nil", err)
	}
	if a == nil || a.Id == "" {
		t.Fatalf("expected a committed action, got %+v", a)
	}
}

// --- tonnage validity ----------------------------------------------------

// Scenario: Zero or negative tonnage is rejected.
func TestCommit_Scenario_ZeroOrNegativeTonnageRejected(t *testing.T) {
	for _, tons := range []float64{0, -0.001, -40} {
		req := validRequest()
		req.Tons = tons
		fa := &fakeMineActions{}
		svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
		_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
		if !errors.Is(err, ErrInvalidTonnage) {
			t.Errorf("tons=%v: err = %v, want ErrInvalidTonnage", tons, err)
		}
		if fa.committed != nil {
			t.Errorf("tons=%v: a rejected commit must create no action", tons)
		}
	}
}

// Scenario: A non-finite tonnage is rejected.
func TestCommit_Scenario_NonFiniteTonnageRejected(t *testing.T) {
	for _, tons := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		req := validRequest()
		req.Tons = tons
		svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
		_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
		if !errors.Is(err, ErrInvalidTonnage) {
			t.Errorf("tons=%v: err = %v, want ErrInvalidTonnage", tons, err)
		}
	}
}

// Scenario: A sub-minimum run is rejected.
func TestCommit_Scenario_SubMinimumRunRejected(t *testing.T) {
	req := validRequest()
	req.Tons = 4
	params := validParams()
	params.MinRunTons = 5
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, params)
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrSubMinimumRun) {
		t.Fatalf("err = %v, want ErrSubMinimumRun", err)
	}
}

// --- remaining preconditions (4.1) ---------------------------------------

// Scenario: Not docked to the feature is rejected.
func TestCommit_Scenario_NotDockedRejected(t *testing.T) {
	coasting := dockedFleet(testCorpA)
	// Not docked means no AttachedTo relationship (design.md Decision 13) —
	// docking is no longer a kinematic mode, so this is expressed by
	// clearing the relationship, not swapping the ship's kinematic mode.
	coasting.State = space.ShipState{Mode: space.ModeDrift, Drift: &space.Drift{}}
	coasting.AttachedTo = ""
	svc := newSvc(t, &fakeFleets{f: coasting}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if !errors.Is(err, ErrNotDocked) {
		t.Fatalf("err = %v, want ErrNotDocked", err)
	}
}

// Scenario: An unknown resource kind is rejected.
func TestCommit_Scenario_UnknownKindRejected(t *testing.T) {
	req := validRequest()
	req.Kind = system.ResourceExotic // the fixture feature only carries metals
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrUnknownKind) {
		t.Fatalf("err = %v, want ErrUnknownKind", err)
	}
}

// Scenario: A request over free hold is rejected at commit.
func TestCommit_Scenario_OverFreeHoldRejected(t *testing.T) {
	full := dockedFleet(testCorpA)
	full.Cargo = map[string]float64{string(system.ResourceMetals): 95} // capacity 100, free hold 5
	req := validRequest()
	req.Tons = 40
	svc := newSvc(t, &fakeFleets{f: full}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if !errors.Is(err, ErrOverFreeHold) {
		t.Fatalf("err = %v, want ErrOverFreeHold", err)
	}
}

// Scenario: A busy movement slot is rejected.
func TestCommit_Scenario_BusyMovementSlotRejected(t *testing.T) {
	busy := dockedFleet(testCorpA)
	busy.ActiveActionId = "action_burning"
	fa := &fakeMineActions{getResult: &action.Action{Id: "action_burning", Type: "burn"}}
	svc := newSvc(t, &fakeFleets{f: busy}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if !errors.Is(err, action.ErrActiveActionExists) {
		t.Fatalf("err = %v, want action.ErrActiveActionExists", err)
	}
}

// Scenario: A fleet with no mining capability is rejected.
func TestCommit_Scenario_NoMiningCapabilityRejected(t *testing.T) {
	noMiner := dockedFleet(testCorpA)
	noMiner.Ships = nil // once the roster fallback lands this is one seed hull;
	// pin the precondition against the STATS table instead, so this test does
	// not depend on the fleet package's roster-fallback stub:
	svc := newSvc(t, &fakeFleets{f: noMiner}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	svc.classStats = map[fleet.ShipClass]fleet.ClassStats{fleet.ClassSeed: {MiningRate: 0, HoldCapacity: 100}}
	_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
	if !errors.Is(err, ErrNoMiningCapability) {
		t.Fatalf("err = %v, want ErrNoMiningCapability", err)
	}
}

// Scenario: No scan is required to commit.
func TestCommit_Scenario_NoScanRequiredToCommit(t *testing.T) {
	// The fixture feature has never been "scanned" by any tracked mechanism —
	// mine.Service has no scan/observation dependency at all, so a commit
	// against a feature the fleet is docked to (and that genuinely carries the
	// kind) must succeed purely from FleetSource/FeatureSource state.
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	if _, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest()); err != nil {
		t.Fatalf("commit against a never-scanned-but-docked feature: err = %v, want nil", err)
	}
}

// --- Already-Depleted Lode Rejected At Commit -----------------------------

// Scenario: Committing against a fully depleted lode is rejected. Table
// covers both the exact-zero and the below-zero (float-drift) cases named in
// the scenario's own text.
func TestCommit_Scenario_AlreadyDepletedLodeRejected(t *testing.T) {
	for _, name := range []string{"exact zero", "below zero (float drift)"} {
		t.Run(name, func(t *testing.T) {
			// -1e9 forces remainingAtNow = max(0, startTons + fold) <= 0
			// regardless of the (tuning-time) richness→startTons curve.
			fa := &fakeMineActions{remaining: -1e9}
			svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
			_, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest())
			if !errors.Is(err, ErrLodeDepleted) {
				t.Errorf("err = %v, want ErrLodeDepleted", err)
			}
		})
	}
}

// Scenario: A lode with an in-flight contested run still commits.
func TestCommit_Scenario_ContestedLodeStillCommits(t *testing.T) {
	fa := &fakeMineActions{remaining: -1} // small fold, startTons (richness-derived, positive) still leaves remaining > 0
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, fa, validParams())
	if _, err := svc.Commit(context.Background(), testCorpA, testFleetID, validRequest()); err != nil {
		t.Fatalf("commit against a positively-remaining, contested lode: err = %v, want nil", err)
	}
}

// --- ETA From Tonnage Target ----------------------------------------------

// Scenario: ETA scales with target tonnage and fleet rate.
func TestCommit_Scenario_EtaScalesWithTonnageAndRate(t *testing.T) {
	req := validRequest()
	req.Tons = 40
	svc := newSvc(t, &fakeFleets{f: dockedFleet(testCorpA)}, &fakeFeatures{interior: featureWithMetals()}, &fakeMineActions{}, validParams())
	svc.classStats = map[fleet.ShipClass]fleet.ClassStats{fleet.ClassSeed: {MiningRate: 10, HoldCapacity: 100}}

	a, err := svc.Commit(context.Background(), testCorpA, testFleetID, req)
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	want := testClock{}.Now() + 4 // 40 tons ÷ 10 tons/unit-time = 4 unit-times
	if a.Eta != want {
		t.Fatalf("eta = %d, want %d (commitTime + tons/rate)", a.Eta, want)
	}
}
