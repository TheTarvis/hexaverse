package fleet

import (
	"context"
	"fmt"

	"hexaverse/action"
	"hexaverse/observation"
	"hexaverse/space"
	"hexaverse/system"
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

// JumpResolver is the jump verb's resolver, registered with the action
// service for type "jump" (fleet-movement "Jump Arrival Parks Near the
// Destination Gate, Unmasked"; design.md Decision 10). Unlike BurnResolver,
// it takes no injected BodySource and matches action.ResolveFunc's own
// signature directly: Resolution's own contract forbids a resolver from
// performing writes, and GetOrCreateInterior against a cold destination
// system WRITES a freshly generated interior — so the settled park is
// parented to the destination gate body BY ID alone, at a standoff derived
// from the UNIVERSAL system.GateSize constant (every gate is the same size —
// design.md Decision 14's own worked bound), never from the destination's
// own (possibly not-yet-materialized) real orbit. Materializing that orbit
// for real — and the destination's interior — is a deliberate, separate,
// service-level step run strictly AFTER this resolve transaction completes
// (Service.Get).
func JumpResolver(_ context.Context, r action.Resolution) (action.ResolveResult, error) {
	var f Fleet
	if err := r.DecodeActor(&f); err != nil {
		return action.ResolveResult{}, err
	}

	// Already settled (a racing read got here first) — no further write.
	if f.Jump == nil {
		return action.ResolveResult{Outcome: "jump already settled"}, nil
	}

	destId := f.Jump.DestSystemId
	laneId := f.Jump.LaneId
	// The destination gate's body id names the lane BACK to the fleet's
	// origin system — from the destination's perspective, the origin IS its
	// destination — mirroring system.gateId's own naming convention
	// ("gate-"+destSystemId), the only way a fleet-package function can
	// refer to "the gate home" without system exporting gateId.
	homeGateId := "gate-" + f.SystemId
	standoff := space.InsertionStandoff(space.Body{Size: system.GateSize})
	settled := space.ShipState{Mode: space.ModeParked, Park: &space.Park{
		Kind: space.ParkOrbit, BodyId: homeGateId, Radius: standoff,
	}}

	// Charts the crossed lane `via: traveled`, marks the destination
	// Explored, and mints no onward rumor — observation's own ArrivalWrites
	// primitive, the same one travel-arrival already uses (design.md
	// Decision 11). Pure w.r.t. Firestore, so a zero-value Service is safe
	// to call it on.
	writes := (&observation.Service{}).ArrivalWrites(f.CorporationId, destId, []string{laneId}, r.At)

	return action.ResolveResult{
		Outcome: fmt.Sprintf("jumped to %s", destId),
		ActorState: map[string]interface{}{
			"systemId":   destId,
			"jump":       nil,
			"attachedTo": "",
			"state":      EncodeKinematicState(settled),
			"updatedAt":  int64(r.At),
		},
		Writes: writes,
	}, nil
}
