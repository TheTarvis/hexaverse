package fleet

import (
	"context"
	"errors"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"

	"go.uber.org/mock/gomock"
)

// fakeClock is a settable world clock for driving arrival transitions.
type fakeClock struct{ now common.WorldMillis }

func (c *fakeClock) Now() common.WorldMillis               { return c.now }
func (c *fakeClock) FromWall(time.Time) common.WorldMillis { return c.now }
func (c *fakeClock) Scale() float64                        { return 1 }

// fakeActions is a hand fake of action.CommitInterface capturing what fleet
// commits/cancels through the spine, so the unit tests can assert the wrapping
// without a Firestore transaction.
type fakeActions struct {
	committed *action.CommitSpec
	cancelled []string
	// Actors whose due actions were folded (ResolveActive calls, in order).
	resolved []string
	// When set, Commit fails with it — the spine's slot guard, scriptable.
	commitErr error
	// resolveResult/resolveErr script ResolveActive's return, so a Service.Get
	// test can drive resolveDue without a real action.Service.
	resolveErr error
}

func (f *fakeActions) Commit(_ context.Context, spec action.CommitSpec) (*action.Action, error) {
	if f.commitErr != nil {
		return nil, f.commitErr
	}
	f.committed = &spec
	return &action.Action{Id: "action_test", Type: spec.Type, Actor: spec.Actor,
		Scope: spec.Scope, Eta: spec.Eta, Status: action.StatusRunning}, nil
}

func (f *fakeActions) Cancel(_ context.Context, id string, _ map[string]interface{}) (*action.Action, error) {
	f.cancelled = append(f.cancelled, id)
	return &action.Action{Id: id, Status: action.StatusCancelled}, nil
}

func (f *fakeActions) ResolveActive(_ context.Context, actor string) ([]action.Action, error) {
	f.resolved = append(f.resolved, actor)
	return nil, f.resolveErr
}

// fakeSystem is an inert BodySource with no real bodies — used directly (not
// via newSvc) by fixtures whose fleet never reaches a body-dependent call
// (e.g. cancel_dock_test.go's docked-but-not-burning fleet).
type fakeSystem struct{}

func (f *fakeSystem) BodyTable(context.Context, string) (*system.BodyTable, error) {
	return nil, errors.New("fleet test fixture: fakeSystem carries no real bodies")
}

// newSvc's default BodySource is a REAL *system.BodyTable ("sys-0", a size-6
// star, no other bodies) built through testBodyTable (space_testutil_test.go)
// — not an inert stub — because at least one pre-existing, untouchable
// section-3 test (attached_to_test.go's TestStop_Scenario_
// ClearsAttachedToAtAcceptance) calls a body-dependent Service method
// (Stop) without ever overriding bodies via WithBodies. Tests that need a
// DIFFERENT body set still override it explicitly with
// svc.WithBodies(stubBodySourceFixed{bt: testBodyTable(t, ...)}).
func newSvc(t *testing.T, clk *fakeClock) (*Service, *MockDao, *fakeActions, *gomock.Controller) {
	ctrl := gomock.NewController(t)
	dao := NewMockDao(ctrl)
	fa := &fakeActions{}
	bodies := testBodyTable(t, "sys-0", 6.0)
	return NewServiceWith(dao, stubBodySourceFixed{bt: bodies}, fa, clk), dao, fa, ctrl
}

// --- OrderTo happy path (successor of the lattice-era
// TestOrderTo_Cell_BurnPathAndEta / TestOrderTo_Feature_InterceptMeetsBodyAndDocks
// / TestOrderTo_MotionOffReduction — collapsed into one point case and one body
// case, since space.SolveBurn has no separate "static vs moving body" code
// path the way board.OrbState's motion-off reduction did: every body target
// resolves through the same intercept solve regardless of whether it moves.) ---

func TestOrderTo_Scenario_PointTargetCommitsABurnWithARealEta(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	point := space.Vec3{X: 400}
	f, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Point: &point})
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", f.State.Mode)
	}
	if f.ActiveActionId != "action_test" {
		t.Fatalf("expected active action claimed, got %q", f.ActiveActionId)
	}
	b := f.State.Burn
	if b.Intercept != point {
		t.Fatalf("intercept = %+v, want the ordered point %+v", b.Intercept, point)
	}
	if b.ArriveMs <= b.DepartMs {
		t.Fatalf("arriveMs (%d) must be after departMs (%d)", b.ArriveMs, b.DepartMs)
	}
	// Committed as a burn action scoped to the system, eta = the arrival.
	if fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected a burn commit, got %+v", fa.committed)
	}
	if fa.committed.Scope != "sys-0" || fa.committed.Eta != b.ArriveMs {
		t.Fatalf("commit scope/eta wrong: %+v", fa.committed)
	}
}

func TestOrderTo_Scenario_BodyTargetSolvesARealIntercept(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	target := orbitingFeature("feat-body-a", 40, 2.0)
	bodies := testBodyTable(t, "sys-0", 6.0, target)
	svc.WithBodies(stubBodySourceFixed{bt: bodies})
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	f, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-body-a"})
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != space.ModeBurn {
		t.Fatalf("expected burn, got %v", f.State.Mode)
	}
	b := f.State.Burn
	if b.Target.BodyId != "feat-body-a" {
		t.Fatalf("burn target = %+v, want body feat-body-a", b.Target)
	}
	// The intercept is the body's insertion-standoff orbit position at
	// ArriveMs, not the body's own centre (space.InsertionStandoff) —
	// independently recomputed via space.Position + the standoff distance,
	// rather than re-deriving BuildCurve's own park construction.
	body, ok := bodies.Body("feat-body-a")
	if !ok {
		t.Fatal("fixture: feat-body-a not found in the body table")
	}
	bodyAt, err := space.Position(bodies, "feat-body-a", b.ArriveMs)
	if err != nil {
		t.Fatalf("recomputing target position: %v", err)
	}
	wantStandoff := space.InsertionStandoff(body)
	gotStandoff := b.Intercept.Sub(bodyAt).Length()
	if diff := gotStandoff - wantStandoff; diff > 1e-6 || diff < -1e-6 {
		t.Fatalf("intercept distance from the body's centre = %v, want the insertion standoff %v", gotStandoff, wantStandoff)
	}
	if fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected a burn commit, got %+v", fa.committed)
	}
}

// fleet-movement, "In-System Burn Order to a Body or a Point" — successor of
// the pre-migration "Ordering a feature absent from the system fails"
// scenario (fleet.ErrFeatureAbsent had no consumer path once burns solve
// through space.SolveBurn against a system.BodyTable): ordering a burn to an
// unknown body id now fails through space's own body-existence check
// (space.ErrUnknownBody), the same identity BuildCurve already uses for any
// unresolvable target — not a fleet-specific sentinel.
func TestOrderTo_Scenario_UnknownBodyIdFails(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	bodies := testBodyTable(t, "sys-0", 6.0) // no "feat-does-not-exist"
	svc.WithBodies(stubBodySourceFixed{bt: bodies})
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil)

	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-does-not-exist"})
	if !errors.Is(err, space.ErrUnknownBody) {
		t.Fatalf("err = %v, want space.ErrUnknownBody", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}

// --- order request validation (fleet-movement "Order Request Validation") ---

func TestOrderTo_Scenario_EmptyOrderRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil).AnyTimes()

	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{})
	if !errors.Is(err, ErrEmptyOrder) {
		t.Fatalf("err = %v, want ErrEmptyOrder", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}

func TestOrderTo_Scenario_AmbiguousOrderRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(freshParkedFleet(), nil).AnyTimes()

	point := space.Vec3{X: 10}
	_, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{BodyId: "feat-body-a", Point: &point})
	if !errors.Is(err, ErrAmbiguousOrder) {
		t.Fatalf("err = %v, want ErrAmbiguousOrder", err)
	}
	if fa.committed != nil {
		t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
	}
}

// --- Get() opportunistic arrival resolve (successor of the lattice-era
// TestGet_ArrivalDocksAfterEta / TestGet_ArrivalCoastsWhenNoDock — the real
// settle logic now lives entirely in BurnResolver (resolver_test.go), so at
// the Service level the only thing left to pin is the DELEGATION: a due
// arrival is resolved through the action spine, opportunistically, on read,
// with no scheduler.) ---

func TestGet_Scenario_DueArrivalDelegatesToTheActionSpine(t *testing.T) {
	clk := &fakeClock{now: 500_000} // past arrival
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{DepartMs: 0, ArriveMs: 300_000}},
	}
	settled := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: space.ShipState{Mode: space.ModeParked, Park: &space.Park{Kind: space.ParkPoint}},
	}
	gomock.InOrder(
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil),
		dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(settled, nil),
	)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(fa.resolved) != 1 || fa.resolved[0] != "fleet_1" {
		t.Fatalf("expected the action spine's ResolveActive to be called for fleet_1, got %v", fa.resolved)
	}
	if f.State.Mode != space.ModeParked {
		t.Fatalf("expected the re-loaded (settled) doc, got %+v", f.State)
	}
}

func TestGet_Scenario_NotYetDueBurnIsNotResolved(t *testing.T) {
	clk := &fakeClock{now: 100_000} // before arrival
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{DepartMs: 0, ArriveMs: 300_000}},
	}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil).Times(1)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(fa.resolved) != 0 {
		t.Fatalf("expected no resolve before the eta, got %v", fa.resolved)
	}
	if f.State.Mode != space.ModeBurn {
		t.Fatalf("expected the still-burning doc unchanged, got %+v", f.State)
	}
}

// --- Cancel delegates to CutDrive for a burning fleet (thin-passthrough
// successor of the lattice-era TestCancel_MidBurnResumesCoast — CutDrive's
// own conversion arithmetic is pinned directly by attached_to_test.go's
// TestCutDrive_Scenario_LeavesAttachedToCleared; this only pins that Cancel
// routes a burning fleet through it rather than some other path). ---

func TestCancel_Scenario_MidBurnConvertsToADrift(t *testing.T) {
	clk := &fakeClock{now: 120_000} // partway through a 300k burn
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0", ActiveActionId: "action_running",
		State: space.ShipState{Mode: space.ModeBurn, Burn: &space.Burn{
			Origin: space.Vec3{}, Target: space.Target{Point: &space.Vec3{X: 100}},
			Intercept: space.Vec3{X: 100}, Accel: 8, DepartMs: 0, ArriveMs: 300_000,
		}},
	}
	// Cancel loads the fleet once itself, then delegates to CutDrive, which
	// loads it again — two dao.Get calls for one Cancel on a burning fleet.
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil).Times(2)

	f, err := svc.Cancel(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != space.ModeDrift {
		t.Fatalf("cancel mid-burn should convert to a drift, got %v", f.State.Mode)
	}
	if len(fa.cancelled) != 1 || fa.cancelled[0] != "action_running" {
		t.Fatalf("expected the running movement action to be cancelled, got %v", fa.cancelled)
	}
}

// TestFleetsForCorp_Scenario_ReportsNoCoverageInThisInterim removed 2026-08-31
// (SDET Item B, migrate-fleet-to-continuous-burns section 7 close-out).
//
// Reason: this test pinned FleetsForCorp's no-op return purely so the method
// had a caller to justify keeping it. FleetsForCorp implemented
// observation.FleetSource (the lattice-hop ambient-coverage dependency
// inversion); that interface is deleted (7.1, confirmed absent by
// observation/lattice_live_half_absent_test.go) and FleetsForCorp has zero
// production callers left (grep confirms — no handler, no service, no other
// package references it). Its return type, []struct{}, cannot carry any
// information; the assertion "len(got) != 0" is a tautology once you accept
// the method exists only to be called by this test. No surviving
// requirement — the four kept `observation` requirements or any `fleet`
// requirement — names this behavior, and design.md's own break table
// (fleet/service.go site) already lists FleetsForCorp for outright deletion
// at a later step of this migration. Deleting the test unblocks that
// deletion; the production stub itself is left for the dev to remove
// (reported, not deleted here — SDET does not touch production code).
