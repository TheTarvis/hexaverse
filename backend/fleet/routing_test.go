package fleet

import (
	"context"
	"errors"
	"testing"

	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"
)

// --- shared travel test fixtures (used across routing/travel/resolver tests) ---

// fakeGraph is a fixed lane graph for routing tests.
type fakeGraph struct{ gg *galaxy.GeneratedGalaxy }

func (f *fakeGraph) GetLive(context.Context) (*galaxy.GeneratedGalaxy, error) { return f.gg, nil }

// fakeTiers is a fixed per-system knowledge map (the requester's charted set).
type fakeTiers struct{ m map[string]observation.Tier }

func (f *fakeTiers) SystemTiers(context.Context, string) (map[string]observation.Tier, error) {
	return f.m, nil
}

// chainGalaxy is a straight A—B—C—D lane chain, 10 units apart on the x axis.
func chainGalaxy() *galaxy.GeneratedGalaxy {
	sys := func(id string, x float64) galaxy.System {
		return galaxy.System{Id: id, Coords: galaxy.Coords{X: x}}
	}
	return &galaxy.GeneratedGalaxy{
		Systems: []galaxy.System{sys("A", 0), sys("B", 10), sys("C", 20), sys("D", 30)},
		Lanes: []galaxy.Lane{
			{Id: "l-ab", AId: "A", BId: "B"},
			{Id: "l-bc", AId: "B", BId: "C"},
			{Id: "l-cd", AId: "C", BId: "D"},
		},
	}
}

func travelSvc(t *testing.T, clk *fakeClock, tiers map[string]observation.Tier) (*Service, *MockDao, *fakeActions) {
	t.Helper()
	svc, dao, fa, ctrl := newSvc(t, clk)
	t.Cleanup(ctrl.Finish)
	svc.WithTravel(&fakeGraph{gg: chainGalaxy()}, &fakeTiers{m: tiers})
	return svc, dao, fa
}

// --- routing tests ----------------------------------------------------------

// A player who has explored A,B routes A→C over the chain; the destination may
// be one Rumored hop past the frontier (C rumored still routes as a terminal).
func TestPlanRoute_ShortestChartedPath(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, _, _ := travelSvc(t, clk, map[string]observation.Tier{
		"A": observation.TierExplored, "B": observation.TierExplored, "C": observation.TierRumored,
	})
	plan, err := svc.planRoute(context.Background(), "corp", "A", "C")
	if err != nil {
		t.Fatal(err)
	}
	if got := plan.route; len(got) != 3 || got[0] != "A" || got[1] != "B" || got[2] != "C" {
		t.Fatalf("route = %v, want [A B C]", got)
	}
	// Each lane in the fixture is 10 units long; a leg costs length × the drive
	// speed. Derived from the params (not a hardcoded number) so retuning the
	// central knob in common/tuning.go doesn't break the routing math.
	wantLeg := common.WorldMillis(10 * svc.params.LaneMsPerDistance)
	for i, ms := range plan.legMs {
		if ms != wantLeg {
			t.Fatalf("legMs[%d] = %d, want %d (10 units × %.0f ms/unit)",
				i, ms, wantLeg, svc.params.LaneMsPerDistance)
		}
	}
	// Arrival charts D (C's only onward neighbour beyond B).
	if len(plan.onward) == 0 {
		t.Fatalf("expected onward neighbours for C")
	}
}

// Two players with different charted sets: the same target routes for one and
// refuses for the other (the fog-honest routing acceptance criterion).
func TestPlanRoute_TwoPlayerAsymmetry(t *testing.T) {
	clk := &fakeClock{now: 0}
	// P1 has explored B, so it can route THROUGH B to a rumored C.
	p1, _, _ := travelSvc(t, clk, map[string]observation.Tier{
		"A": observation.TierExplored, "B": observation.TierExplored, "C": observation.TierRumored,
	})
	if _, err := p1.planRoute(context.Background(), "p1", "A", "C"); err != nil {
		t.Fatalf("P1 should route A→C: %v", err)
	}
	// P2 only knows B as Rumored — it can't route THROUGH an uncharted intermediate.
	p2, _, _ := travelSvc(t, clk, map[string]observation.Tier{
		"A": observation.TierExplored, "B": observation.TierRumored,
	})
	if _, err := p2.planRoute(context.Background(), "p2", "A", "C"); !errors.Is(err, ErrNoRoute) {
		t.Fatalf("P2 should get ErrNoRoute for A→C, got %v", err)
	}
}

func TestPlanRoute_SameSystemRejected(t *testing.T) {
	clk := &fakeClock{now: 0}
	svc, _, _ := travelSvc(t, clk, map[string]observation.Tier{"A": observation.TierExplored})
	if _, err := svc.planRoute(context.Background(), "corp", "A", "A"); !errors.Is(err, ErrSameSystem) {
		t.Fatalf("expected ErrSameSystem, got %v", err)
	}
}
