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
	// Actors whose due actions were folded (ResolveActive calls, in order).
	resolved []string
	// When set, Commit fails with it — the spine's slot guard, scriptable.
	commitErr error
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
	// ETA = now + distance × msPerTile. Derived from the service's own params (not
	// a hardcoded number) so retuning common/tuning.go doesn't break the burn math.
	if want := common.WorldMillis(5) * svc.params.MsPerTile; b.ArriveTime != want {
		t.Fatalf("arriveTime = %d, want %d (5 hexes × %d ms/tile)",
			b.ArriveTime, want, svc.params.MsPerTile)
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

// TestListInSystem_ArrivedBurnReadsAsMoving is the "my ship stopped dead" bug: the
// board's read (ListInSystem) doesn't WRITE the arrival settle — that's Get's job —
// but it must still SHOW the fleet where physics puts it. An unprojected arrived
// burn reads as a burn forever, and BurnPos pins a past-ETA burn to its last path
// hex, so the ship sat frozen at its destination while the system turned around it.
func TestListInSystem_ArrivedBurnReadsAsMoving(t *testing.T) {
	const arriveTime = 300_000
	clk := &fakeClock{now: arriveTime + 10_000} // the burn finished a while ago
	svc, dao, _, ctrl := newSvc(t, clk)
	defer ctrl.Finish()

	dest := board.Hex{Q: 5, R: 0}
	arrived := coastFleetAtCentre()
	arrived.State = board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{
		Path: board.Line(board.Hex{Q: 0, R: 0}, dest), StartTime: 0, ArriveTime: arriveTime,
	}}
	dao.EXPECT().ListBySystem(gomock.Any(), "sys-0").Return([]Fleet{*arrived}, nil)

	list, err := svc.ListInSystem(context.Background(), "sys-0")
	if err != nil || len(list) != 1 {
		t.Fatalf("list: got %d fleets, err=%v", len(list), err)
	}
	f := list[0]

	if f.State.Mode != board.ModeCoast || f.State.Coast == nil {
		t.Fatalf("an arrived fleet must read as coasting, got %s", f.State.Mode)
	}
	// It is in the orbit it entered AT the moment it arrived — no teleport...
	if got, _ := board.ShipPos(f.State, arriveTime); got != dest {
		t.Errorf("at arrival the fleet is at %+v, want its destination %+v", got, dest)
	}
	// ...and it has MOVED since, because it's coasting, not parked.
	perCell := common.Tuning().OrbitPeriod(board.Ring(dest)) / common.WorldMillis(6*board.Ring(dest))
	if got, _ := board.ShipPos(f.State, arriveTime+perCell); got == dest {
		t.Errorf("still on %+v a full cell-time after arrival — the ship is frozen", dest)
	}
}

// movingBodySystem is an interior whose body actually ORBITS (the default fake's
// planet is motion-off), so a dock onto it is a dock onto something that moves.
type movingBodySystem struct{ orbit system.Orbit }

func (f *movingBodySystem) GetOrCreateInterior(context.Context, string) (*system.GeneratedInterior, error) {
	o := f.orbit
	return &system.GeneratedInterior{
		Interior: system.SystemInterior{SystemId: "sys-0", Radius: 16},
		Features: []system.Feature{{Id: "feat-belt-0", Type: system.FeatureBelt, Orbit: &o,
			Footprint: []system.Hex{{Q: o.Ring, R: 0}}}},
	}, nil
}

func (f *movingBodySystem) LaneGates(context.Context, string, int) ([]system.LaneGate, error) {
	return nil, nil
}

// TestFleetsForCorp_DockedToOrbitingBodyRidesIt: the fog's coverage source must see
// a due arrival SETTLED, or a ship that docked onto an orbiting body lends its
// sensor bubble to the hex the burn ended on — a hex the body has since orbited
// away from. The body then falls outside the corp's own coverage and drops out of
// its board payload: the ship stops seeing the very thing it is holding onto (and
// the client, with no parent to ride, jumps the ship tile-to-tile instead of
// gliding it around the orbit).
func TestFleetsForCorp_DockedToOrbitingBodyRidesIt(t *testing.T) {
	const arriveTime = 100_000
	orbit := system.Orbit{Ring: 4, Angle0: 0, Period: 144_000, Dir: 1} // one cell / 6000ms
	sys := &movingBodySystem{orbit: orbit}

	elements := board.Orbit{Ring: orbit.Ring, Angle0: orbit.Angle0, Period: orbit.Period, Dir: orbit.Dir}
	burnEnd := board.OrbState(elements, arriveTime) // where the belt was on arrival

	// Long enough after arrival that the belt has swung well clear of that hex.
	clk := &fakeClock{now: arriveTime + 60_000}
	wantHex := board.OrbState(elements, clk.now)
	if wantHex == burnEnd {
		t.Fatal("fixture: the belt must have moved by now, or this test proves nothing")
	}

	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	svc := NewServiceWith(dao, sys, &fakeActions{}, clk)

	docked := coastFleetAtCentre()
	docked.State = board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{
		Path:         board.Line(board.Hex{Q: 0, R: 0}, burnEnd),
		StartTime:    0,
		ArriveTime:   arriveTime,
		DockOnArrive: "feat-belt-0",
	}}
	dao.EXPECT().ListByCorporation(gomock.Any(), "dev-corp").Return([]Fleet{*docked}, nil)

	got, err := svc.FleetsForCorp(context.Background(), "dev-corp", clk.now)
	if err != nil || len(got) != 1 {
		t.Fatalf("FleetsForCorp: got %d, err=%v", len(got), err)
	}
	if got[0].Hex != wantHex {
		t.Errorf("sensor position = %+v, want %+v (the belt's LIVE hex — %+v is where the burn ended)",
			got[0].Hex, wantHex, burnEnd)
	}
}
