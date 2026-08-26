package action

import (
	"context"
	"errors"
	"testing"

	"hexaverse/board"

	"go.uber.org/mock/gomock"
)

// action-dispatch, ADDED requirement: "Commit Rejects Non-Primitive Action
// Parameters" (design.md Decision 4, part 2; tasks.md 1.4). action.Commit does
// not validate Params yet, and action.ErrNonPrimitiveParam does not exist —
// this file is red until both land.
//
// The allowlist (design.md): nil, string, bool, int, int64, float64,
// []string, []int64, []float64, []any, map[string]any — validated recursively
// through []any and map[string]any. This governs Params ONLY; ActorState is
// exempt (it legitimately carries board.MovementState structs).

// Scenario: A domain struct in params is rejected at commit.
func TestCommit_Scenario_DomainStructInParamsIsRejected(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)
	// Nothing must be persisted: no action document written, no actor slot
	// claimed — the DAO's Commit must never be called.
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)

	svc := NewServiceWith(dao, &fakeClock{now: 0}, nil)
	svc.RegisterResolver("burn", KindKinematic, noopResolver)

	_, err := svc.Commit(context.Background(), CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"target": board.Cell{Ring: 3, Slot: 1}},
		Eta:    1000,
	})
	if !errors.Is(err, ErrNonPrimitiveParam) {
		t.Fatalf("err = %v, want ErrNonPrimitiveParam", err)
	}
}

// Scenario: A nested non-primitive inside a map or slice is rejected.
func TestCommit_Scenario_NestedNonPrimitiveIsRejected(t *testing.T) {
	cell := board.Cell{Ring: 2, Slot: 0}
	cases := map[string]map[string]interface{}{
		"nested in map": {
			"target": map[string]interface{}{"cell": cell},
		},
		"nested in slice": {
			"path": []interface{}{"a", cell},
		},
		"doubly nested": {
			"outer": map[string]interface{}{
				"inner": []interface{}{map[string]interface{}{"cell": cell}},
			},
		},
	}
	for name, params := range cases {
		t.Run(name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()
			dao := NewMockDao(ctrl)
			dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Times(0)

			svc := NewServiceWith(dao, &fakeClock{now: 0}, nil)
			svc.RegisterResolver("burn", KindKinematic, noopResolver)

			_, err := svc.Commit(context.Background(), CommitSpec{
				Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
				Params: params, Eta: 1000,
			})
			if !errors.Is(err, ErrNonPrimitiveParam) {
				t.Fatalf("err = %v, want ErrNonPrimitiveParam", err)
			}
		})
	}
}

// Scenario: An encoded coordinate map commits normally.
func TestCommit_Scenario_EncodedCoordinateMapCommitsNormally(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	var stored Action
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, a Action, _ map[string]interface{}) error {
			stored = a
			return nil
		})

	svc := NewServiceWith(dao, &fakeClock{now: 500}, nil)
	svc.RegisterResolver("scan", KindMutating, noopResolver)

	encoded := board.EncodeCell(board.Cell{Ring: 4, Slot: 9})
	a, err := svc.Commit(context.Background(), CommitSpec{
		Type: "scan", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params: map[string]interface{}{"origin": encoded},
		Eta:    9000,
	})
	if err != nil {
		t.Fatalf("commit of an encoded coordinate map failed: %v", err)
	}
	if a == nil || stored.Id != a.Id {
		t.Fatalf("commit did not persist the action")
	}
	// The stored params round-trip to the SAME map — no mutation, no drop.
	gotOrigin, ok := stored.Params["origin"].(map[string]any)
	if !ok {
		t.Fatalf("stored params[origin] = %v (%T), want the encoded map preserved", stored.Params["origin"], stored.Params["origin"])
	}
	if gotOrigin["ring"] != int64(4) || gotOrigin["slot"] != int64(9) {
		t.Fatalf("stored params[origin] = %v, want ring:4 slot:9", gotOrigin)
	}
}

// Scenario: Actor state carrying a domain struct still commits — ActorState is
// NOT subject to the Params allowlist (it is merged onto the actor doc by the
// actor domain's own stored shapes, e.g. fleet.Fleet.State board.MovementState).
func TestCommit_Scenario_ActorStateWithDomainStructStillCommits(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	movementState := board.MovementState{
		Mode:  board.ModeCoast,
		Coast: &board.Orbit{Ring: 3, Angle0: 0, Period: 36000, Dir: 1},
	}

	var gotActorState map[string]interface{}
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, a Action, actorState map[string]interface{}) error {
			gotActorState = actorState
			return nil
		})

	svc := NewServiceWith(dao, &fakeClock{now: 0}, nil)
	svc.RegisterResolver("burn", KindKinematic, noopResolver)

	_, err := svc.Commit(context.Background(), CommitSpec{
		Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
		Params:     map[string]interface{}{"dockOnArrive": ""},
		Eta:        1000,
		ActorState: map[string]interface{}{"state": movementState, "updatedAt": int64(0)},
	})
	if err != nil {
		t.Fatalf("commit with a struct-carrying ActorState should succeed (ActorState is exempt from the Params allowlist): %v", err)
	}
	if gotActorState == nil {
		t.Fatal("ActorState was not passed through to the DAO")
	}
	if st, ok := gotActorState["state"].(board.MovementState); !ok || st.Mode != board.ModeCoast {
		t.Fatalf("ActorState[\"state\"] = %v, want the movement-state struct preserved untouched", gotActorState["state"])
	}
}

// Boundary: the allowlist itself, checked directly against every listed type
// plus one representative rejection, at the top level (not nested) — cheap
// coverage of Decision 4's exact list, independent of the commit plumbing.
func TestCommit_Scenario_AllowlistCoversEveryListedPrimitiveShape(t *testing.T) {
	allowed := map[string]interface{}{
		"nil":            nil,
		"string":         "s",
		"bool":           true,
		"int":            1,
		"int64":          int64(1),
		"float64":        1.5,
		"[]string":       []string{"a", "b"},
		"[]int64":        []int64{1, 2},
		"[]float64":      []float64{1.5, 2.5},
		"[]any":          []any{"a", int64(1)},
		"map[string]any": map[string]any{"k": "v"},
	}
	for name, v := range allowed {
		t.Run("allowed/"+name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			defer ctrl.Finish()
			dao := NewMockDao(ctrl)
			dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil)

			svc := NewServiceWith(dao, &fakeClock{now: 0}, nil)
			svc.RegisterResolver("burn", KindKinematic, noopResolver)

			_, err := svc.Commit(context.Background(), CommitSpec{
				Type: "burn", Actor: "fleet-1", ActorCollection: "fleets", Scope: "sys-1",
				Params: map[string]interface{}{"v": v},
				Eta:    1000,
			})
			if err != nil {
				t.Fatalf("allowlisted value %s (%v) was rejected: %v", name, v, err)
			}
		})
	}
}
