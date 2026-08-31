package fleet

import (
	"context"
	"fmt"

	"hexaverse/action"
	"hexaverse/space"
)

// RegisterResolvers wires fleet's per-type action resolvers onto the shared
// action service. Called once at startup (and in tests) so the same service
// instance that fleet commits through — and that the sweep resolves through —
// knows how to settle a "burn". bodies is the BodySource the resolver folds
// a settling burn through (design.md Decision 16) — the same dependency
// Service.WithBodies wires for the commit/read paths.
//
// The path-swept ambient reveal this resolver used to also mint
// (RegisterResolversWithAmbient/AmbientRecorder/BurnResolverWithAmbient) has
// no successor after Decision 4 (a burn's path is no longer a []board.Cell to
// sweep) — deleted here rather than carried forward broken; link 4 section 7
// deletes the observation-side reveal writer it fed.
func RegisterResolvers(a *action.Service, bodies BodySource) {
	a.RegisterResolver(burnType, action.KindKinematic, BurnResolver(bodies))
}

// BurnResolver is the fleet's kinematic resolver, registered with the action
// service for type "burn". When a burn's eta passes, resolution folds the
// fleet's motion state through space.StateAt (design.md Decision 21A) — a
// body-targeted burn settles into a ParkOrbit riding its target, which is
// exactly the instant AttachedTo is set to that body's id (tasks.md 3.1: "a
// body-targeted burn sets AttachedTo only at resolve"). It reads the live
// burn off the actor doc (motion state is owned by the fleet, not duplicated
// into the action's params) and returns the settled state for action to
// write atomically with the status flip and slot release.
func BurnResolver(bodies BodySource) action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}

		bt, err := bodies.BodyTable(ctx, f.SystemId)
		if err != nil {
			return action.ResolveResult{}, fmt.Errorf("fleet: resolving bodies for burn resolve: %w", err)
		}
		state, err := DecodeKinematicState(bt, f.StateDoc, burnType, r.Action.Id)
		if err != nil {
			return action.ResolveResult{}, err
		}

		// Already settled (a racing read got here first) — no state write,
		// just let action flip the status / release the slot.
		if state.Mode != space.ModeBurn || state.Burn == nil {
			return action.ResolveResult{Outcome: "burn already settled"}, nil
		}

		settled, err := space.StateAt(bt, state, r.At)
		if err != nil {
			return action.ResolveResult{}, fmt.Errorf("fleet: folding settled burn state: %w", err)
		}

		outcome := "arrived"
		attachedTo := ""
		if settled.Mode == space.ModeParked && settled.Park != nil && settled.Park.BodyId != "" {
			attachedTo = settled.Park.BodyId
			outcome = "docked at " + attachedTo
		}

		return action.ResolveResult{
			Outcome: outcome,
			ActorState: map[string]interface{}{
				"state": EncodeKinematicState(settled), "attachedTo": attachedTo, "updatedAt": int64(r.At),
			},
		}, nil
	}
}
