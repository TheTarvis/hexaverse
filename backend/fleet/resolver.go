package fleet

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/action"
	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/discovery"
	"hexaverse/sightings"
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
// no successor after Decision 4 (a burn's path is no longer a list of cells to
// sweep) — deleted here rather than carried forward broken; link 4 section 7
// deletes the observation-side reveal writer it fed.
func RegisterResolvers(a *action.Service, bodies BodySource) {
	a.RegisterResolver(burnType, action.KindKinematic, BurnResolver(bodies))
	// jump is registered KindKinematic, not KindMutating: action.Kind's own
	// doc comment (action/model.go) already draws this line — "Kinematic
	// actions (burn, lane-travel) settle a computed state on their actor;
	// mutating actions (mine, scan) append a ledger delta" — and jump is
	// exactly that lane-travel case. JumpResolver returns no action.Delta
	// (mine's ledger-additive effect); it settles ActorState (systemId,
	// jump cleared, the parked kinematic state) the same way BurnResolver
	// does, plus Writes for the arrival chart/explored mint — a path burn's
	// own settle doesn't need but that Kind is silent on (Writes apply
	// identically for both kinds; action/dao.go's ResolveOne never branches
	// on Kind at all — it is a stored classification for readers, not a
	// dispatch switch). Kind's asymmetry that DOES matter operationally is
	// KindMutating's ledger-delta bookkeeping (LedgerKey, exactly-once
	// Delta doc), which jump has no use for.
	a.RegisterResolver(jumpType, action.KindKinematic, JumpResolver)

	// The generic action-cancel route's (POST /v1/actions/:actionId/cancel)
	// own per-type discard producer (add-fuel-as-cargo tasks.md 2.5): the
	// ONE discard path with no fleet-package call site in hand to compute
	// its own refund from data already loaded in memory. Every OTHER
	// discard path (cut-drive, a superseding order/stop, POST
	// /v1/fleets/:fleetId/cancel) already computes and merges this refund
	// directly (service.go's priorBurnRefund), so action.Service.Cancel
	// never routes THOSE calls through a producer at all (they always
	// supply a non-nil actorState) — see action/service.go's own Cancel
	// doc comment.
	a.RegisterCancelProducer(burnType, burnCancelRefundProducer)
}

// burnCancelRefundProducer computes the transaction-scoped ActorState merge
// for a generic cancel against a running "burn"-type action — reading the
// actor's OWN transactional field data (the same read action.Commit's slot
// check already performs), never a stale pre-transaction snapshot. Touches
// ONLY cargo.fuel: the generic cancel route deliberately leaves State/
// AttachedTo untouched (action/handler.go's own doc comment — "Verbs with
// motion state ... cancel through their own endpoint so they can settle a
// coast"), so this producer must not invent a state transition the route
// has never made.
func burnCancelRefundProducer(actorData map[string]interface{}) (map[string]interface{}, error) {
	stateRaw, _ := actorData["state"].(map[string]interface{})
	if stateRaw == nil {
		return map[string]interface{}{}, nil
	}
	mode, _ := stateRaw["mode"].(string)
	if mode != "burn" {
		return map[string]interface{}{}, nil
	}
	value, _ := stateRaw["value"].(map[string]interface{})
	if value == nil {
		return map[string]interface{}{}, nil
	}
	departMs := asWorldMillis(value["departMs"])
	arriveMs := asWorldMillis(value["arriveMs"])
	storedCost := asFloat64(actorData["burnFuelCostTons"])
	now := common.WorldClock().Now()
	refund := DiscardRefundTons(storedCost, departMs, arriveMs, now)
	if refund <= 0 {
		return map[string]interface{}{}, nil
	}
	currentFuel := readCargoFuel(actorData)
	return map[string]interface{}{
		"cargo": map[string]interface{}{"fuel": currentFuel + refund},
	}, nil
}

// ShipSource resolves every fleet currently in a system — the resolving
// focused scan's masking-chain lookup (design.md Decision 13; task 5.8).
// *fleet.Service already satisfies this structurally via its own
// ListInSystem method (service.go).
type ShipSource interface {
	ListInSystem(ctx context.Context, systemID string) ([]Fleet, error)
}

// RegisterScanResolver wires the focused-scan resolver onto the shared
// action service for type "scan" — kept as its own function, separate from
// RegisterResolvers, so router.go's composition root can supply the
// ShipSource dependency (a *fleet.Service, itself) without changing
// RegisterResolvers' own established two-argument shape, which
// resolver_registration_test.go and burn_docks_every_mineable_feature_type_
// test.go already call directly.
func RegisterScanResolver(a *action.Service, ships ShipSource, bodies BodySource) {
	a.RegisterResolver(scanType, action.KindMutating, ScanResolver(ships, bodies))
}

// ScanResolver is the focused-scan verb's resolver, registered with the
// action service for type "scan" (RegisterScanResolver) — alongside
// BurnResolver/JumpResolver, mirroring BurnResolver's own injected-
// BodySource pattern (design.md Decision 13). It reads the resolving
// fleet's masking-chain candidates INSIDE the resolve transaction callback
// (ships.ListInSystem, bodies.BodyTable) and mints the resulting sighting
// records ONLY through sightings.MintWrites, returned as
// ResolveResult.Writes — the exactly-once ledger of a resolver that
// performs no write of its own (design.md Decision 13: a sighting does not
// self-heal, and would be lost permanently on a crash between the status
// flip and the write if minted after the resolve transaction instead).
//
// Every record is stamped at pulse-reach — the midpoint of the committed
// depart/arrive window, never resolution time (design.md Decision 14) — by
// evaluating range, occlusion, and the masking chain from the scanner's OWN
// folded position at that instant, re-checked against
// disclosure.FocusedScan's own predicates unchanged (design.md Decision
// 15). A sweep fizzles — minting nothing, releasing the sensor-channel slot
// all the same — when the scanner left the host's system, is in lane
// transit at pulse-reach, the target host cannot be resolved, or the
// geometry re-check fails; each fizzle carries a ReasonCode distinguishing
// its cause (focused-scan "A Sweep Resolves Into Sightings, Or Fizzles").
func ScanResolver(ships ShipSource, bodies BodySource) action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var f Fleet
		if err := r.DecodeActor(&f); err != nil {
			return action.ResolveResult{}, err
		}

		// Already settled (a racing read got here first) — no-op. Carries
		// its own reason code, distinct from every geometry/system/transit/
		// host-resolution code below: a consumer that treats ANY served
		// reason code as a fizzle (system-space-view "A Settled Sweep
		// Reports Its Outcome") would otherwise misreport this no-mint
		// resolution as having filed records over an empty log
		// (focused-scan "A sweep already settled by a racing read carries
		// its own reason code").
		if f.Scan == nil {
			return action.ResolveResult{Outcome: "scan already settled", ReasonCode: "alreadySettled"}, nil
		}
		window := *f.Scan
		pulseReach := window.DepartMs + (window.ArriveMs-window.DepartMs)/2

		release := map[string]interface{}{
			"activeScanId": "", "scan": nil, "updatedAt": int64(r.At),
		}
		fizzle := func(reason string) (action.ResolveResult, error) {
			return action.ResolveResult{
				Outcome: "scan fizzled: " + reason, ReasonCode: reason, ActorState: release,
			}, nil
		}

		// f.Jump != nil -> lane transit; checked BEFORE the system check,
		// since a transiting fleet's stored SystemId is stale and must not
		// be read as "still in the origin system" (design.md Decision 4).
		if f.Jump != nil {
			return fizzle("laneTransit")
		}
		// The scan resolves scoped to the system it was COMMITTED in
		// (r.Action.Scope) — a scanner that has since moved on is scoped
		// elsewhere and mints nothing here.
		if f.SystemId != r.Action.Scope {
			return fizzle("leftSystem")
		}

		bt, err := bodies.BodyTable(ctx, f.SystemId)
		if err != nil {
			return action.ResolveResult{}, fmt.Errorf("fleet: resolving bodies for scan resolve: %w", err)
		}
		// Decoded off the STORED, Firestore-native StateDoc — never the
		// bare State field, which carries firestore:"-" and is therefore
		// never populated by DecodeActor's raw transactional read
		// (BurnResolver/JumpResolver's own established pattern).
		state, err := DecodeKinematicState(bt, f.StateDoc, scanType, r.Action.Id)
		if err != nil {
			return action.ResolveResult{}, err
		}
		scannerPos, err := space.StatePosition(bt, state, pulseReach)
		if err != nil {
			return action.ResolveResult{}, fmt.Errorf("fleet: resolving scanner position at pulse-reach: %w", err)
		}

		allShips, err := ships.ListInSystem(ctx, f.SystemId)
		if err != nil {
			return action.ResolveResult{}, fmt.Errorf("fleet: listing ships for scan resolve: %w", err)
		}
		shipMap := make(map[string]disclosure.Ship, len(allShips))
		for i := range allShips {
			raw := &allShips[i]
			// Decoded from the raw StateDoc for the same reason the
			// scanner's own state is above — ListInSystem's caller may be
			// a raw fake (as the resolver's own unit tests are), never
			// assumed pre-hydrated.
			shipState, derr := DecodeKinematicState(bt, raw.StateDoc, scanType, r.Action.Id)
			if derr != nil {
				continue // a malformed foreign fleet degrades to "not found", not a failed resolve
			}
			shipMap[raw.Id] = disclosure.Ship{
				Id: raw.Id, State: shipState, InLaneTransit: raw.Jump != nil,
			}
		}
		// A sweep never files a claim against its own scanner (focused-scan
		// "A Sweep Never Files a Claim Against Its Own Scanner"): the
		// scanner satisfies chainBeneath trivially whenever it is itself
		// masked at the swept host (docked there, or docked to a carrier
		// docked there), and disclosure.FocusedScan mints from whatever
		// ships map it is handed with no owner/identity filter of its own.
		// Deleting the scanner's OWN entry here — never from Attachments,
		// which must keep walking the real chain structure — makes
		// FocusedScan's existing "ok" lookup skip it exactly like any other
		// id absent from the caller's ship set, and its existing
		// len(out)==0 clean-sweep fallback fires for free when the scanner
		// was the only thing masked at the host.
		delete(shipMap, r.Action.Actor)

		// Attachments (attachments.go) is the shared adapter both the
		// interior read's contact union (fleet.FleetsInSystem) and this
		// resolver build over the fleet set they each already hold — one
		// notion of "who is docked where", not a second, divergent one.
		w := disclosure.World{
			Bodies: bt, Attachments: Attachments(allShips), StarId: bt.StarId(), StarSize: bt.StarSize(), SystemId: f.SystemId,
		}
		records, err := disclosure.FocusedScan(w, scannerPos, window.HostId, shipMap, pulseReach)
		switch {
		case errors.Is(err, disclosure.ErrScanOutOfRange):
			return fizzle("outOfRange")
		case errors.Is(err, disclosure.ErrScanOccluded):
			return fizzle("occluded")
		case errors.Is(err, space.ErrUnknownBody):
			return fizzle("hostUnresolved")
		case err != nil:
			return action.ResolveResult{}, err
		}

		out := make([]sightings.Sighting, 0, len(records))
		for _, rec := range records {
			out = append(out, sightings.Sighting{
				SystemId: rec.SystemId, AsOf: rec.AsOf, TargetId: rec.TargetId,
				Position: rec.Position, Velocity: rec.Velocity, Emitting: rec.Emitting,
				HullCount: rec.HullCount, HullTypes: rec.HullTypes,
				CleanSweep: rec.CleanSweep, HostId: rec.HostId,
			})
		}

		return action.ResolveResult{
			Outcome:    "swept " + window.HostId,
			ActorState: release,
			Writes:     sightings.MintWrites(f.CorporationId, r.Action.Id, out),
		}, nil
	}
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
		var writes []action.DocWrite
		if settled.Mode == space.ModeParked && settled.Park != nil && settled.Park.BodyId != "" {
			attachedTo = settled.Park.BodyId
			outcome = "docked at " + attachedTo
			// A body-targeted burn settling into an attached park at a
			// lane-gate body charts that gate's lane `via: gate` for the
			// fleet's corporation (design.md Decision 3 item 2;
			// specs/galaxy-knowledge/spec.md — "Gate-Attachment Knowledge
			// Write"). GateAttachmentWrite gates internally on the
			// "gate-" body-id prefix and returns nil for any other body,
			// so no branching on gate-ness is needed here.
			writes = charts.GateAttachmentWrite(f.CorporationId, f.SystemId, attachedTo, r.At)
		}

		return action.ResolveResult{
			Outcome: outcome,
			ActorState: map[string]interface{}{
				"state": EncodeKinematicState(settled), "attachedTo": attachedTo, "updatedAt": int64(r.At),
			},
			Writes: writes,
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
	// Explored, and mints no onward rumor — charts' own ArrivalWrites
	// primitive, the same one travel-arrival already uses
	// (replace-observation-with-sightings design.md Decision 1). Pure
	// w.r.t. Firestore, so a zero-value Service is safe to call it on.
	writes := (&charts.Service{}).ArrivalWrites(f.CorporationId, destId, []string{laneId}, r.At)
	if gid, ok := r.Action.Params["galaxyId"].(string); ok && gid != "" && r.ReadDocument != nil {
		arrival, err := (&discovery.Service{}).ArrivalWrites(r, gid, destId, f.CorporationId)
		if err != nil {
			return action.ResolveResult{}, err
		}
		writes = append(writes, arrival...)
	}

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
