package fleet

import (
	"context"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// RegisterResolvers wires fleet's per-type action resolvers onto the shared
// action service. Called once at startup (and in tests) so the same service
// instance that fleet commits through — and that the sweep resolves through —
// knows how to settle a "burn".
func RegisterResolvers(a *action.Service) {
	a.RegisterResolver(burnType, action.KindKinematic, BurnResolver(DefaultMovementParams()))
}

// BurnResolver is the fleet's kinematic resolver, registered with the action
// service for type "burn". When a burn's eta passes, resolution settles the
// fleet's motion state — dock onto the intercepted body, or coast at the meet
// hex — the exact transition #0004 reads already compute (#0005 kinematic
// resolve). It reads the live burn off the actor doc (motion state is owned by
// the fleet, not duplicated into the action's params) and returns the settled
// state for action to write atomically with the status flip and slot release.
func BurnResolver(params MovementParams) action.ResolveFunc {
	return func(_ context.Context, r action.Resolution) (action.ResolveResult, error) {
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}
		// Already settled (a racing read got here first) — no state write, just let
		// action flip the status / release the slot.
		if f.State.Mode != board.ModeBurn || f.State.Burn == nil {
			return action.ResolveResult{Outcome: "burn already settled"}, nil
		}
		b := f.State.Burn
		var settled board.MovementState
		var outcome string
		if b.DockOnArrive != "" {
			settled = board.MovementState{Mode: board.ModeDocked, Docked: &board.Docked{ParentId: b.DockOnArrive}}
			outcome = "docked at " + b.DockOnArrive
		} else {
			meet := b.Path[len(b.Path)-1]
			settled = coastState(meet, params.CoastPeriod)
			outcome = "arrived"
		}
		return action.ResolveResult{
			Outcome:    outcome,
			ActorState: map[string]interface{}{"state": settled, "updatedAt": int64(r.At)},
		}, nil
	}
}

// coastState is the resting orbit a fleet inherits when it settles onto a hex.
func coastState(h board.Hex, period common.WorldMillis) board.MovementState {
	ring, idx := board.AngleOf(h)
	return board.MovementState{
		Mode:  board.ModeCoast,
		Coast: &board.Orbit{Ring: ring, Angle0: idx, Period: period, Dir: 1},
	}
}
