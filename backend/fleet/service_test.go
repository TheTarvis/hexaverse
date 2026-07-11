package fleet

import (
	"context"
	"testing"
	"time"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
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
}

func (f *fakeActions) Commit(_ context.Context, spec action.CommitSpec) (*action.Action, error) {
	f.committed = &spec
	return &action.Action{Id: "action_test", Type: spec.Type, Actor: spec.Actor,
		Scope: spec.Scope, Eta: spec.Eta, Status: action.StatusRunning}, nil
}

func (f *fakeActions) Cancel(_ context.Context, id string, _ map[string]interface{}) (*action.Action, error) {
	f.cancelled = append(f.cancelled, id)
	return &action.Action{Id: id, Status: action.StatusCancelled}, nil
}

func (f *fakeActions) ResolveActive(context.Context, string) ([]action.Action, error) {
	return nil, nil
}

// fakeSystem returns a fixed interior: a static star and a (slow ⇒ static)
// planet, so the motion-off reduction is exercised.
type fakeSystem struct{}

func (f *fakeSystem) GetOrCreateInterior(context.Context, string) (*system.GeneratedInterior, error) {
	planetOrbit := &system.Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1} // effectively static
	planetHex := board.OrbState(board.Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1}, 0)
	return &system.GeneratedInterior{
		Interior: system.SystemInterior{SystemId: "sys-0", Radius: 16},
		Features: []system.Feature{
			{Id: "feat-star", Type: system.FeatureStar, Fixed: true, Footprint: []system.Hex{{Q: 0, R: 0}}},
			{Id: "feat-planet", Type: system.FeatureRocky, Orbit: planetOrbit,
				Footprint: []system.Hex{{Q: planetHex.Q, R: planetHex.R}}},
		},
	}, nil
}

func (f *fakeSystem) LaneGates(context.Context, string, int) ([]system.LaneGate, error) {
	return nil, nil
}

func coastFleetAtCentre() *Fleet {
	return &Fleet{
		Id: "fleet_1", CorporationId: "dev-corp", SystemId: "sys-0",
		State: board.MovementState{Mode: board.ModeCoast, Coast: &board.Orbit{Ring: 0, Angle0: 0, Period: 1, Dir: 1}},
	}
}

func newSvc(t *testing.T, clk *fakeClock) (*Service, *MockDao, *fakeActions, *gomock.Controller) {
	ctrl := gomock.NewController(t)
	dao := NewMockDao(ctrl)
	fa := &fakeActions{}
	return NewServiceWith(dao, &fakeSystem{}, fa, clk), dao, fa, ctrl
}

func TestOrderTo_Hex_BurnPathAndEta(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// The burn commits through the action spine (Commit writes the fleet doc), so
	// OrderTo no longer calls dao.Save directly.
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

	dest := board.Hex{Q: 5, R: 0}
	f, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Target: board.Target{Hex: &dest}})
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != board.ModeBurn {
		t.Fatalf("expected burn, got %s", f.State.Mode)
	}
	if f.ActiveActionId != "action_test" {
		t.Fatalf("expected active action claimed, got %q", f.ActiveActionId)
	}
	b := f.State.Burn
	if b.Path[0] != (board.Hex{Q: 0, R: 0}) || b.Path[len(b.Path)-1] != dest {
		t.Fatalf("path endpoints wrong: %v", b.Path)
	}
	// ETA = now + distance × msPerTile (5 × 60_000).
	if want := common.WorldMillis(5 * 60_000); b.ArriveTime != want {
		t.Fatalf("arriveTime = %d, want %d", b.ArriveTime, want)
	}
	for i := 1; i < len(b.Path); i++ {
		if board.Distance(b.Path[i-1], b.Path[i]) != 1 {
			t.Fatalf("path not contiguous at %d", i)
		}
	}
	// Committed as a burn action scoped to the system, eta = the arrival.
	if fa.committed == nil || fa.committed.Type != burnType {
		t.Fatalf("expected a burn commit, got %+v", fa.committed)
	}
	if fa.committed.Scope != "sys-0" || fa.committed.Eta != b.ArriveTime {
		t.Fatalf("commit scope/eta wrong: %+v", fa.committed)
	}
}

func TestOrderTo_Feature_InterceptMeetsBodyAndDocks(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, dao, fa, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

	f, err := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Target: board.Target{FeatureId: "feat-planet"}})
	if err != nil {
		t.Fatal(err)
	}
	b := f.State.Burn
	if b.DockOnArrive != "feat-planet" {
		t.Fatalf("dockOnArrive = %q", b.DockOnArrive)
	}
	// Meet hex equals the body's computed position at arriveTime (intercept determinism).
	planet := board.Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1}
	if b.Path[len(b.Path)-1] != board.OrbState(planet, b.ArriveTime) {
		t.Fatalf("meet hex != body pos at arriveTime")
	}
	if fa.committed == nil || fa.committed.Params["dockOnArrive"] != "feat-planet" {
		t.Fatalf("commit params should record the dock target: %+v", fa.committed)
	}
}

func TestOrderTo_MotionOffReduction(t *testing.T) {
	// A featureId target (static planet) yields the SAME order as a hex target
	// at the planet's hex — no intercept special-case.
	planetHex := board.OrbState(board.Orbit{Ring: 5, Angle0: 3, Period: 1 << 60, Dir: 1}, 0)

	clk := &fakeClock{now: 0}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)
	byFeature, _ := svc.OrderTo(context.Background(), "fleet_1", OrderRequest{Target: board.Target{FeatureId: "feat-planet"}})

	clk2 := &fakeClock{now: 0}
	svc2, dao2, _, ctrl2 := newSvc(t, clk2)
	defer ctrl2.Finish()
	dao2.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)
	byHex, _ := svc2.OrderTo(context.Background(), "fleet_1", OrderRequest{Target: board.Target{Hex: &planetHex}})

	if byFeature.State.Burn.ArriveTime != byHex.State.Burn.ArriveTime {
		t.Fatalf("arriveTime differs: feature=%d hex=%d",
			byFeature.State.Burn.ArriveTime, byHex.State.Burn.ArriveTime)
	}
	if byFeature.State.Burn.Path[len(byFeature.State.Burn.Path)-1] != byHex.State.Burn.Path[len(byHex.State.Burn.Path)-1] {
		t.Fatal("meet hex differs between feature and hex targets")
	}
}

func TestOrderTo_RejectsTheCore(t *testing.T) {
	// The star at the core is a body, not a destination: neither a hex order to
	// (0,0) nor an order to dock the star feature is allowed.
	core := board.Hex{Q: 0, R: 0}
	cases := []struct {
		name string
		req  OrderRequest
	}{
		{"hex (0,0)", OrderRequest{Target: board.Target{Hex: &core}}},
		{"dock the star", OrderRequest{Target: board.Target{FeatureId: "feat-star"}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			clk := &fakeClock{now: 0}
			svc, dao, fa, ctrl := newSvc(t, clk)
			defer ctrl.Finish()
			dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(coastFleetAtCentre(), nil)

			_, err := svc.OrderTo(context.Background(), "fleet_1", tc.req)
			if err != ErrCoreDestination {
				t.Fatalf("expected ErrCoreDestination, got %v", err)
			}
			if fa.committed != nil {
				t.Fatalf("a rejected order must not commit an action: %+v", fa.committed)
			}
		})
	}
}

func TestSeedFleet_RejectsTheCore(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, _, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	// No dao.Save is expected — seeding onto the core (0,0) must reject first.
	_, err := svc.SeedFleet(context.Background(), "sys-0", "dev-corp", board.Hex{Q: 0, R: 0})
	if err != ErrCoreDestination {
		t.Fatalf("expected ErrCoreDestination, got %v", err)
	}
}

func TestGet_ArrivalDocksAfterEta(t *testing.T) {
	clk := &fakeClock{now: 500_000} // past arrival
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := coastFleetAtCentre()
	burning.State = board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{
		Path: board.Line(board.Hex{Q: 0, R: 0}, board.Hex{Q: 5, R: 0}), StartTime: 0, ArriveTime: 300_000,
		DockOnArrive: "feat-planet",
	}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)
	var saved Fleet
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != board.ModeDocked || saved.State.Docked.ParentId != "feat-planet" {
		t.Fatalf("expected docked to feat-planet, got %+v", f.State)
	}
}

func TestGet_ArrivalCoastsWhenNoDock(t *testing.T) {
	clk := &fakeClock{now: 500_000}
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burning := coastFleetAtCentre()
	burning.State = board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{
		Path: board.Line(board.Hex{Q: 0, R: 0}, board.Hex{Q: 5, R: 0}), StartTime: 0, ArriveTime: 300_000,
	}}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).Return(nil)

	f, err := svc.Get(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != board.ModeCoast {
		t.Fatalf("expected coast on arrival, got %s", f.State.Mode)
	}
	// Coasts the local orbit of the hex it settled on (ring 5).
	if f.State.Coast.Ring != board.Ring(board.Hex{Q: 5, R: 0}) {
		t.Fatalf("coast ring = %d, want %d", f.State.Coast.Ring, board.Ring(board.Hex{Q: 5, R: 0}))
	}
}

func TestCancel_MidBurnResumesCoast(t *testing.T) {
	clk := &fakeClock{now: 120_000} // partway through a 300k burn
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	burn := board.Burn{
		Path: board.Line(board.Hex{Q: 0, R: 0}, board.Hex{Q: 5, R: 0}), StartTime: 0, ArriveTime: 300_000,
	}
	// Capture the mid-burn hex BEFORE Cancel mutates the fleet's state to coast.
	midHex := board.BurnPos(burn, 120_000)

	burning := coastFleetAtCentre()
	burning.State = board.MovementState{Mode: board.ModeBurn, Burn: &burn}
	dao.EXPECT().Get(gomock.Any(), "fleet_1").Return(burning, nil)
	var saved Fleet
	dao.EXPECT().Save(gomock.Any(), gomock.Any()).DoAndReturn(func(_ context.Context, f Fleet) error {
		saved = f
		return nil
	})

	f, err := svc.Cancel(context.Background(), "fleet_1")
	if err != nil {
		t.Fatal(err)
	}
	if f.State.Mode != board.ModeCoast {
		t.Fatalf("cancel should coast, got %s", f.State.Mode)
	}
	if saved.State.Coast.Ring != board.Ring(midHex) {
		t.Fatalf("coast ring %d != mid-burn hex ring %d", saved.State.Coast.Ring, board.Ring(midHex))
	}
}
