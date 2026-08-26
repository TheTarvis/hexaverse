package fleet

import (
	"context"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// AmbientRecorder is the fog-domain dependency for passive-sensor reveal on move
// (observation.Service implements it). Injected into the burn resolver so a
// resolved move mints per-feature presence memory for what its sensor bubble
// swept — path-swept ambient (#0006 Decision #14). Nil disables ambient reveal.
type AmbientRecorder interface {
	AmbientWrites(ctx context.Context, cid, systemID string, path []board.Cell, at common.WorldMillis) ([]action.DocWrite, error)
}

// RegisterResolvers wires fleet's per-type action resolvers onto the shared
// action service. Called once at startup (and in tests) so the same service
// instance that fleet commits through — and that the sweep resolves through —
// knows how to settle a "burn". Without an AmbientRecorder the burn is purely
// kinematic; use RegisterResolversWithAmbient to also mint on-move memory.
func RegisterResolvers(a *action.Service) {
	a.RegisterResolver(burnType, action.KindKinematic, BurnResolver(DefaultMovementParams()))
}

// RegisterResolversWithAmbient is RegisterResolvers plus path-swept ambient
// reveal at move resolution (#0006). Wired at startup once the fog service
// exists.
func RegisterResolversWithAmbient(a *action.Service, ambient AmbientRecorder) {
	a.RegisterResolver(burnType, action.KindKinematic, BurnResolverWithAmbient(DefaultMovementParams(), ambient))
}

// BurnResolver is the fleet's kinematic resolver, registered with the action
// service for type "burn". When a burn's eta passes, resolution settles the
// fleet's motion state — dock onto the intercepted body, or coast at the meet
// cell — the exact transition #0004 reads already compute (#0005 kinematic
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
		// The settle IS the effective-state fold: r.At is the action's frozen eta —
		// the burn's arriveTime — so StateAt folds the burn into exactly the state
		// every read has been answering with since the ship arrived. The write adds
		// nothing new; it caches the fold and rides the slot release.
		settled := board.StateAt(f.State, r.At, board.ProductionSchedule())
		outcome := "arrived"
		if settled.Mode == board.ModeDocked {
			outcome = "docked at " + settled.Docked.ParentId
		}
		return action.ResolveResult{
			Outcome:    outcome,
			ActorState: map[string]interface{}{"state": settled, "updatedAt": int64(r.At)},
		}, nil
	}
}

// BurnResolverWithAmbient wraps the kinematic burn resolver with path-swept
// ambient reveal: after settling motion state, it mints presence memory for the
// features the sensor bubble swept along the burn path (stamped asOf:eta). The
// reveal writes ride the same resolve transaction as the status flip, so a move
// resolved late still records exactly what the bubble passed (path is frozen).
func BurnResolverWithAmbient(params MovementParams, ambient AmbientRecorder) action.ResolveFunc {
	base := BurnResolver(params)
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		res, err := base(ctx, r)
		if err != nil || ambient == nil {
			return res, err
		}
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return res, err
		}
		if f.State.Mode != board.ModeBurn || f.State.Burn == nil {
			return res, nil // nothing swept (already settled)
		}
		writes, err := ambient.AmbientWrites(ctx, f.CorporationId, f.SystemId, f.State.Burn.Path, r.At)
		if err != nil {
			return action.ResolveResult{}, err
		}
		res.Writes = append(res.Writes, writes...)
		return res, nil
	}
}

// The resting-orbit settle primitive lives in board (board.CoastAt): the free
// prograde orbit a thing inherits when it comes to rest on a hex, paced by the
// world's one orbital law, read live so retuning re-paces settling fleets exactly
// as it re-paces bodies. A coasting fleet therefore DRIFTS with its ring — to
// hold station on a body, dock to it (board.ModeDocked rides a parent).
