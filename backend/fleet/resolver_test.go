package fleet

import (
	"context"
	"testing"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// fakeAmbient captures whether ambient reveal ran and hands back canned writes.
type fakeAmbient struct {
	called bool
	writes []action.DocWrite
}

func (f *fakeAmbient) AmbientWrites(_ context.Context, _, _ string, _ []board.Hex, _ common.WorldMillis) ([]action.DocWrite, error) {
	f.called = true
	return f.writes, nil
}

// TestBurnResolverWithAmbient_AppendsSweptWrites proves a resolved move both
// settles motion state (kinematic) AND appends the path-swept ambient reveal.
func TestBurnResolverWithAmbient_AppendsSweptWrites(t *testing.T) {
	amb := &fakeAmbient{writes: []action.DocWrite{{Path: []string{"corporations", "corp-1", "observations", "sys-1", "features", "feat-0"}}}}
	resolver := BurnResolverWithAmbient(DefaultMovementParams(), amb)

	burning := Fleet{
		CorporationId: "corp-1", SystemId: "sys-1",
		State: board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{Path: []board.Hex{{Q: 0, R: 0}, {Q: 1, R: 0}}}},
	}
	res, err := resolver(context.Background(), action.Resolution{
		At: 1000,
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = burning
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if res.ActorState == nil {
		t.Errorf("a resolved burn must still settle motion state (kinematic)")
	}
	if !amb.called {
		t.Errorf("ambient reveal not invoked on move resolution")
	}
	if len(res.Writes) != 1 {
		t.Errorf("swept ambient writes not appended, got %d", len(res.Writes))
	}
}

// TestBurnResolverWithAmbient_NilRecorderIsPlainBurn keeps the resolver kinematic
// when no ambient recorder is wired.
func TestBurnResolverWithAmbient_NilRecorderIsPlainBurn(t *testing.T) {
	resolver := BurnResolverWithAmbient(DefaultMovementParams(), nil)
	res, err := resolver(context.Background(), action.Resolution{
		At: 1000,
		DecodeActor: func(target interface{}) error {
			*(target.(*Fleet)) = Fleet{State: board.MovementState{Mode: board.ModeBurn, Burn: &board.Burn{Path: []board.Hex{{Q: 0, R: 0}}}}}
			return nil
		},
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if len(res.Writes) != 0 {
		t.Errorf("nil ambient recorder should mint no writes, got %d", len(res.Writes))
	}
}

// TestCoastState_ObeysTheSharedOrbitalLaw pins the seam that removed fleet's own
// CoastPeriod: a fleet settling on ring N inherits the SAME period a body on ring N
// has (common.Tuning().OrbitPeriod), so ships and rocks at one radius keep pace.
// Regression guard — a flat, un-scaled fleet period made rim ships cross hexes
// faster than inner ones, which is the bug the two redundant knobs were hiding.
func TestCoastState_ObeysTheSharedOrbitalLaw(t *testing.T) {
	// A hex on ring 4 (four steps out along one axis).
	h := board.Hex{Q: 4, R: 0}
	ring, _ := board.AngleOf(h)
	if ring != 4 {
		t.Fatalf("fixture: AngleOf(%+v) ring = %d, want 4", h, ring)
	}

	const settledAt = common.WorldMillis(16_000_000_000) // a realistic "now", not the epoch

	st := board.CoastAt(h, settledAt)
	if st.Mode != board.ModeCoast || st.Coast == nil {
		t.Fatalf("coastState mode = %q, coast = %+v", st.Mode, st.Coast)
	}
	if want := common.Tuning().OrbitPeriod(ring); st.Coast.Period != want {
		t.Errorf("coast period on ring %d = %d, want %d (the body law)", ring, st.Coast.Period, want)
	}

	// And the fleet is actually WHERE IT STOPPED — Angle0 is epoch-anchored, so a
	// naive settle would advance it and teleport the ship across the ring. The
	// anchor snaps to the nearest cell-window boundary (render continuity — see
	// board.CoastAt), so at the settle instant the ship is within the cell it's
	// crossing (distance ≤ 1 of h), and EXACTLY h at the snapped boundary.
	if got := board.OrbState(*st.Coast, settledAt); board.Distance(got, h) > 1 {
		t.Errorf("settled at %+v but coasts through %+v at that instant (teleport)", h, got)
	}
	oneStep := common.Tuning().OrbitPeriod(ring) / common.WorldMillis(6*ring)
	boundary := (settledAt + oneStep/2) / oneStep * oneStep
	if got := board.OrbState(*st.Coast, boundary); got != h {
		t.Errorf("coast passes through %+v at the settle boundary, want %+v", got, h)
	}

	// And it re-paces when the world is retuned — the fleet is not frozen at the
	// pace its resolver was registered with.
	base := common.DefaultTuning()
	fast := base
	fast.OrbitBasePeriod = base.OrbitBasePeriod / 100
	common.SetTuning(fast)
	defer common.SetTuning(base)

	if got, want := board.CoastAt(h, settledAt).Coast.Period, fast.OrbitPeriod(ring); got != want {
		t.Errorf("after retune, coast period = %d, want %d", got, want)
	}
}
