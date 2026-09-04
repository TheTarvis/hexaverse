package action

// RED-phase (for delete-the-lattice) replacement cases for
// commit_params_validator_test.go, tasks 4.4 / 4.4b — action-dispatch's
// MODIFIED "Commit Rejects Non-Primitive Action Parameters".
//
// commit_params_validator_test.go (unmodified by the SDET; a developer-owned
// mechanical repoint per tasks.md 4.4) imports the `board` package and
// asserts against four of its exported types: the discrete cell coordinate,
// the Firestore-native encoder that renders that coordinate primitive, the
// movement-state struct and the orbital-state struct — all vocabulary of a
// package this change deletes. Rather than edit that file directly (test
// immutability; the file's own repoint is a developer task, since it also
// has to physically delete the `board` import the moment `backend/board` is
// deleted, in the SAME commit as G4/G6 per the implementation contract),
// this file carries the CONTINUOUS-space successor of each of its four
// scenarios — proven red-for-the-right-reason exactly like the original
// was — so the developer's mechanical repoint has a pre-verified target to
// land, rather than reinventing the fixture shape.
//
// SDET-OWNED REVISION, to land with the developer's deletion (README lesson
// six / this change's red-manifest note): once `backend/board` is deleted
// (task 5.1) and commit_params_validator_test.go is repointed (task 4.4/
// 4.4b), DELETE commit_params_validator_test.go's four board-based cases —
// TestCommit_Scenario_DomainStructInParamsIsRejected,
// TestCommit_Scenario_NestedNonPrimitiveIsRejected,
// TestCommit_Scenario_EncodedCoordinateMapCommitsNormally, and
// TestCommit_Scenario_ActorStateWithDomainStructStillCommits — since this
// file's four functions below cover the identical scenarios against the
// surviving representation; keeping both would just be duplicated coverage
// of a package (`board`) that no longer exists. Do NOT touch
// TestCommit_Scenario_AllowlistCoversEveryListedPrimitiveShape — it names no
// board symbol and is untouched by this change.
//
// Every one of the four scenarios below is ALREADY GREEN against today's
// tree (space.Vec3/space.EncodeVec/space.DecodeVec/space.ShipState already
// exist; action.Commit's validator already rejects any non-allowlisted
// struct generically, not the deleted coordinate type by name) — this is a
// deletion change's coverage-relocation, not new production behaviour. Each
// rejection case's red-for-the-right-reason proof is therefore the same
// falsification form task 2.11 uses: confirm it goes red against a
// scratch-widened allowlist, recorded in the coverage report rather than
// committed here (widening the real allowlist is production code, not a
// test change).

import (
	"context"
	"errors"
	"testing"

	"hexaverse/space"

	"go.uber.org/mock/gomock"
)

// Scenario: A domain struct in params is rejected at commit.
func TestCommit_Scenario_DomainStructInParamsIsRejected_Continuous(t *testing.T) {
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
		Params: map[string]interface{}{"target": space.Vec3{X: 3, Y: 1, Z: 0}},
		Eta:    1000,
	})
	if !errors.Is(err, ErrNonPrimitiveParam) {
		t.Fatalf("err = %v, want ErrNonPrimitiveParam", err)
	}
}

// Scenario: A nested non-primitive inside a map or slice is rejected.
func TestCommit_Scenario_NestedNonPrimitiveIsRejected_Continuous(t *testing.T) {
	vec := space.Vec3{X: 2, Y: 0, Z: 0}
	cases := map[string]map[string]interface{}{
		"nested in map": {
			"target": map[string]interface{}{"position": vec},
		},
		"nested in slice": {
			"path": []interface{}{"a", vec},
		},
		"doubly nested": {
			"outer": map[string]interface{}{
				"inner": []interface{}{map[string]interface{}{"position": vec}},
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
func TestCommit_Scenario_EncodedCoordinateMapCommitsNormally_Continuous(t *testing.T) {
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

	origin := space.Vec3{X: 4, Y: 9, Z: -2}
	encoded := space.EncodeVec(origin)
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
	// The stored params round-trip through space.DecodeVec to the ORIGINAL
	// Vec3 — no mutation, no drop, no lossy re-encoding.
	gotOrigin, ok := stored.Params["origin"].([]float64)
	if !ok {
		t.Fatalf("stored params[origin] = %v (%T), want the encoded []float64 preserved", stored.Params["origin"], stored.Params["origin"])
	}
	decoded, err := space.DecodeVec(gotOrigin)
	if err != nil {
		t.Fatalf("space.DecodeVec(stored params[origin]): %v", err)
	}
	if decoded != origin {
		t.Fatalf("decoded stored origin = %+v, want the original %+v", decoded, origin)
	}
}

// Scenario: Actor state carrying a domain struct still commits — ActorState
// is NOT subject to the Params allowlist (it is merged onto the actor doc by
// the actor domain's own stored shapes, e.g. fleet.Fleet.State
// space.ShipState).
func TestCommit_Scenario_ActorStateWithDomainStructStillCommits_Continuous(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := NewMockDao(ctrl)

	shipState := space.ShipState{
		Mode: space.ModeParked,
		Park: &space.Park{Kind: space.ParkPoint, Point: space.Vec3{X: 1, Y: 2, Z: 3}},
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
		ActorState: map[string]interface{}{"state": shipState, "updatedAt": int64(0)},
	})
	if err != nil {
		t.Fatalf("commit with a struct-carrying ActorState should succeed (ActorState is exempt from the Params allowlist): %v", err)
	}
	if gotActorState == nil {
		t.Fatal("ActorState was not passed through to the DAO")
	}
	if st, ok := gotActorState["state"].(space.ShipState); !ok || st.Mode != space.ModeParked {
		t.Fatalf("ActorState[\"state\"] = %v, want the movement-state struct preserved untouched", gotActorState["state"])
	}
}
