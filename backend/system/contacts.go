package system

// Foreign presence on the interior read (replace-observation-with-sightings
// design.md Decision 6; tasks.md 4.4, 4.5): the requester corporation's live
// disclosure of a system's foreign ship presence, computed as the union
// over the requester's own fleets present in the system
// (proximity-disclosure "Disclosure to a Corporation Is the Union Over Its
// Own Assets"), deduplicated by target.
//
// This is where `system` reaches for `disclosure` a second time (bodies.go
// already imports it, for the still-unconsumed asDisclosureWorld capability
// check) — but never for `hexaverse/sightings`
// (never_imports_sightings_test.go pins that at compile time): a target's
// presence in the result is decided solely by this live union, never by
// whether a sighting for it exists.

import (
	"context"
	"sort"

	"hexaverse/common"
	"hexaverse/disclosure"
	"hexaverse/space"
)

// FleetPresence is one fleet present in a system, in the minimal
// disclosure-ready shape the interior read's contact union needs — never
// fleet.Fleet itself: system must never import fleet (that dependency
// already runs the other way, fleet -> system, for BodySource — a cycle
// otherwise).
type FleetPresence struct {
	Id            string
	CorporationId string
	Ship          disclosure.Ship
}

// FleetSource supplies every fleet present in a system, plus the
// disclosure.Attachments adapter built over that same set
// (replace-observation-with-sightings tasks.md 4.1's fleet.Attachments,
// returned here as the interface this package already imports rather than
// its concrete type) — masking-chain resolution needs visibility into every
// fleet's host, not just the requester's own or a single foreign target.
// Consumer-declared, exactly like StationSource: satisfied structurally by
// *fleet.Service at the composition root (router.go), which this package
// never imports.
type FleetSource interface {
	FleetsInSystem(ctx context.Context, systemId string) ([]FleetPresence, disclosure.Attachments, error)
}

// Contacts computes the requester corporation's live disclosure of a
// system's foreign ship presence: the union, across the requester's own
// fleets present in the system, of what each alone would disclose,
// deduplicated by target (proximity-disclosure "Disclosure to a
// Corporation Is the Union Over Its Own Assets"; system-interior "Foreign
// Presence Is Served As System Contacts"). Returns an empty, NEVER NIL
// slice for a requester with no fleet of its own present in the system —
// including an authenticated but corpless requester (requesterCorpId ==
// ""), which needs no separate branch: the union of zero observers is
// empty by construction.
//
// A masked, docked own fleet still contributes as an observer (masking
// governs disclosure of a fleet, never what it can itself observe); a
// lane-transiting own fleet contributes nothing, because there is no
// position to resolve it an observer from (proximity-disclosure
// "Disclosure to a Corporation Is the Union Over Its Own Assets" — "A
// fleet in lane transit contributes no observation").
func (s *Service) Contacts(ctx context.Context, systemID, requesterCorpId string, bt *BodyTable, now common.WorldMillis) ([]disclosure.Contact, error) {
	contacts := make([]disclosure.Contact, 0)
	if s.fleets == nil || bt == nil {
		return contacts, nil
	}

	presences, attachments, err := s.fleets.FleetsInSystem(ctx, systemID)
	if err != nil {
		return nil, err
	}

	// Deterministic order: presences arrive from a store with no guaranteed
	// order, and both the observer set and the target set must be stable
	// across two reads of the same underlying state (so DiscloseUnion's own
	// "first observer to disclose wins" resolution is reproducible too).
	sorted := append([]FleetPresence(nil), presences...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Id < sorted[j].Id })

	var observers []disclosure.Observer
	var targets []disclosure.Ship
	for _, p := range sorted {
		if requesterCorpId != "" && p.CorporationId == requesterCorpId {
			if p.Ship.InLaneTransit {
				continue // no position to observe from (design.md Decision 12)
			}
			pos, err := space.StatePosition(bt, p.Ship.State, now)
			if err != nil {
				// Degrade: an own fleet whose position cannot be resolved
				// contributes no observation rather than failing the whole
				// read (mirrors BodyTable's/ListForCorp's own degradation
				// precedent elsewhere in this codebase).
				continue
			}
			observers = append(observers, disclosure.Observer{Position: pos, PassiveRange: disclosure.PassiveRange})
			continue
		}
		targets = append(targets, p.Ship)
	}

	if len(observers) == 0 {
		return contacts, nil
	}

	w := asDisclosureWorld(bt)
	w.Attachments = attachments
	w.SystemId = systemID
	got, err := disclosure.DiscloseUnion(w, observers, targets, now)
	if err != nil {
		return nil, err
	}
	return append(contacts, got...), nil
}

// InteriorExtras bundles what a materialized interior's read needs beyond
// the stored interior itself: every feature's and lane gate's continuous
// position/size (tasks.md 4.7), and the requester corporation's own live
// contact union (tasks.md 4.5) — assembled behind ONE seam
// (InteriorReadExtras below) so system/handler.go never spells the body
// table's type by name (system-body-table "The Body Table Is an Unfiltered
// Internal Seam, Never a Response").
type InteriorExtras struct {
	Features []fogFeatureDTO
	Gates    []LaneGate
	Contacts []disclosure.Contact
}

// InteriorReadExtras resolves the system's body table exactly once and
// derives everything the interior handler needs from it: each feature's
// continuous Space (fillFeatureGeometry, fog.go), each lane gate's Space/
// Size (fillGateGeometry, gates.go), and the requester's own contact union
// (Contacts, above). Degrades to the input features/gates unchanged and an
// empty contact list — never failing the whole read — when the body table
// itself is unavailable, mirroring every other BodyTable-dependent
// degradation already in this package (spliceStation, addGates).
func (s *Service) InteriorReadExtras(ctx context.Context, systemID, requesterCorpId string, features []fogFeatureDTO, gates []LaneGate, now common.WorldMillis) (InteriorExtras, error) {
	bt, err := s.BodyTable(ctx, systemID)
	if err != nil {
		return InteriorExtras{Features: features, Gates: gates, Contacts: []disclosure.Contact{}}, err
	}

	filled := fillFeatureGeometry(features, bt, now)
	fillGateGeometry(gates, bt, now)

	contacts, err := s.Contacts(ctx, systemID, requesterCorpId, bt, now)
	if err != nil {
		return InteriorExtras{Features: filled, Gates: gates, Contacts: []disclosure.Contact{}}, err
	}
	return InteriorExtras{Features: filled, Gates: gates, Contacts: contacts}, nil
}
