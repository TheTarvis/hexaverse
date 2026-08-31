package fleet

// RED-phase test for openspec change migrate-fleet-to-continuous-burns,
// tasks.md 6.4 — RegisterResolvers must wire JumpResolver onto the shared
// action.Service alongside BurnResolver. router.go:98 calls exactly this
// function to wire production
// (`fleet.RegisterResolvers(actionSvc, systemSvc)`), so a gap here is a
// production gap: a committed jump's ETA passes with no resolver able to
// settle it, and per design.md Decision 4 a fleet mid-laneTransit has no
// position in either system — it is not merely stuck, it is invisible and
// uncommandable, forever.
//
// action.Service keeps its resolver registry in an unexported map with no
// exported lookup/inspection method (action/service.go), so this test does
// not reach into that field. Instead it drives the one exported signal the
// registry produces: Service.Commit's very first line is
//
//	reg, ok := s.resolvers[spec.Type]
//	if !ok { return nil, ErrUnknownType }
//
// — checked before params validation, before touching the DAO, before
// anything else Commit does. So "Commit(type) does not bounce with
// ErrUnknownType" is a direct, exported-API pin of "type is registered",
// isolated from every other way Commit can fail. This is preference option 1
// from the handoff (registry-level assertion), reached through Commit rather
// than a private field.
//
// Both burnType and jumpType are asserted in the same test (table-driven) so
// a future fix cannot satisfy this by registering one under the other's key
// — each must independently clear the ErrUnknownType gate.

import (
	"context"
	"errors"
	"testing"

	"hexaverse/action"

	"go.uber.org/mock/gomock"
)

// Scenario (SDET-added; pins tasks.md 6.4 directly — no scenario in the
// change's deltas names this wiring bug by title, since it is an
// implementation-level task, not a user-facing scenario, but its absence
// breaks "Lane Jump" outright): RegisterResolvers wires the jump action type
// onto the action service exactly as it wires burn — Commit must accept
// jumpType, not bounce it with action.ErrUnknownType.
func TestRegisterResolvers_Scenario_JumpTypeRegisteredAlongsideBurn(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()
	dao := action.NewMockDao(ctrl)
	// Commit only reaches the DAO once the type clears the registry gate. Once
	// 6.4 is fixed, both subtests below reach here — expect it called once per
	// (distinct) registered type, each accepted.
	dao.EXPECT().Commit(gomock.Any(), gomock.Any(), gomock.Any()).Return(nil).Times(2)

	clk := &fakeClock{now: 0}
	actions := action.NewServiceWith(dao, clk, nil)

	// The exact function router.go:98 calls to wire production.
	RegisterResolvers(actions, stubBodySourceFixed{})

	cases := []struct {
		name       string
		actionType string
	}{
		{"burn", burnType},
		{"jump", jumpType},
	}

	// Distinctness guard: if burnType and jumpType ever collapsed to the same
	// dispatch key, the two Commit calls below would silently both exercise
	// the same registry entry and this test would stop meaning anything.
	if burnType == jumpType {
		t.Fatalf("burnType and jumpType must be distinct dispatch keys, both got %q", burnType)
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := actions.Commit(context.Background(), action.CommitSpec{
				Type:            tc.actionType,
				Actor:           "fleet_1",
				ActorCollection: "fleets",
				Scope:           "sys-0",
				Eta:             1,
			})
			if errors.Is(err, action.ErrUnknownType) {
				t.Fatalf("Commit(type=%q) = %v; want the type accepted (registered by RegisterResolvers) — "+
					"tasks.md 6.4 requires RegisterResolvers wire %q onto the action service exactly as it "+
					"already wires %q, since router.go:98 wires production through this exact function",
					tc.actionType, err, tc.actionType, burnType)
			}
			if err != nil {
				t.Fatalf("Commit(type=%q): unexpected error %v (want nil once the type is registered)", tc.actionType, err)
			}
		})
	}
}
