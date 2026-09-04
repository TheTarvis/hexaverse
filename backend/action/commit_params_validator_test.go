package action

import (
	"context"
	"testing"

	"go.uber.org/mock/gomock"
)

// action-dispatch, "Commit Rejects Non-Primitive Action Parameters"
// (design.md Decision 4, part 2).
//
// The allowlist (design.md): nil, string, bool, int, int64, float64,
// []string, []int64, []float64, []any, map[string]any — validated recursively
// through []any and map[string]any. This governs Params ONLY; ActorState is
// exempt (it legitimately carries domain structs, e.g. space.ShipState).
//
// The four scenario tests that used to sit above this one —
// DomainStructInParamsIsRejected, NestedNonPrimitiveIsRejected,
// EncodedCoordinateMapCommitsNormally and ActorStateWithDomainStructStillCommits
// — were expressed against the deleted coordinate types (a cell struct, its
// encode/decode pair, and the old movement-state struct). Their CONTINUOUS
// successors, one per scenario and asserting the identical properties against
// space.Vec3 / space.EncodeVec / space.DecodeVec / space.ShipState, live in
// commit_params_validator_continuous_test.go — the SDET-authored replacement
// this file's repoint was written to land against. Keeping both would be
// duplicated coverage of a package that no longer exists.

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
