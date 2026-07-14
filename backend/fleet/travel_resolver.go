package fleet

import (
	"context"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/observation"
)

// ArrivalRecorder is the fog-domain dependency for the arrival reveal (#0008):
// it builds the observation writes a trip's resolution applies — destination →
// Explored, onward lanes → Rumored (monotonic). observation.Service implements
// it. Kept as an interface so fleet doesn't hard-depend on the concrete service.
type ArrivalRecorder interface {
	ArrivalWrites(cid, destSystemID string, onward []string, tiers map[string]observation.Tier, at common.WorldMillis) []action.DocWrite
}

// RegisterTravelResolver wires the lane-travel resolver onto the shared action
// service, at startup once the fog service exists. The reveal (Explored + onward
// Rumored) rides the same resolve transaction as the motion settle — exactly-
// once, destination-on-arrival (never at commit or mid-route).
func RegisterTravelResolver(a *action.Service, arrivals ArrivalRecorder, tiers TierSource) {
	a.RegisterResolver(travelType, action.KindKinematic, TravelResolver(DefaultMovementParams(), arrivals, tiers))
}

// TravelResolver settles a trip when its ETA passes: the fleet lands coasting at
// the destination board's entry gate (its systemId flips to the destination), and
// the arrival reveal is minted as Writes. The first-arrival #0003 detail roll is
// triggered post-resolve in Get (create-if-absent), keeping the heavy generation
// out of the resolve transaction.
func TravelResolver(params MovementParams, arrivals ArrivalRecorder, tiers TierSource) action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}
		lt := f.State.LaneTransit
		if f.State.Mode != board.ModeLaneTransit || lt == nil || len(lt.Route) == 0 {
			// Already settled (a racing read got here first) — let action flip the
			// status / release the slot with no state write.
			return action.ResolveResult{Outcome: "trip already settled"}, nil
		}
		dest := lt.Route[len(lt.Route)-1]
		coast := board.CoastAt(lt.EntryGate, r.At)
		actorState := map[string]interface{}{
			"systemId":  dest,
			"state":     coast,
			"updatedAt": int64(r.At),
		}

		var writes []action.DocWrite
		if arrivals != nil && tiers != nil {
			tierMap, err := tiers.SystemTiers(ctx, f.CorporationId)
			if err != nil {
				return action.ResolveResult{}, err
			}
			writes = arrivals.ArrivalWrites(f.CorporationId, dest, lt.Onward, tierMap, r.At)
		}
		return action.ResolveResult{
			Outcome:    "arrived at " + dest,
			ActorState: actorState,
			Writes:     writes,
		}, nil
	}
}
