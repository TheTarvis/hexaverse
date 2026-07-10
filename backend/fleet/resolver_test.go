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
