package fleet

import (
	"context"
	"fmt"
	"sort"

	"hexaverse/common"
	"hexaverse/space"
	"hexaverse/system"
)

// ScanTargetKindBody and ScanTargetKindFleet are ScanTarget.Kind's only two
// values (link8b-impl-contract.md §1.1 — DECIDED HERE: a lane gate, a
// station, a planet, a moon, and a belt are all "body", because they are all
// bt.Body(id) entries and the client has one label path for all of them).
const (
	ScanTargetKindBody  = "body"
	ScanTargetKindFleet = "fleet"
)

// ScanTarget is one entry in a fleet's served scan-target set: a host a
// focused-scan commit against it, at the read's own world time, would
// accept — priced at the duration that same commit would freeze
// (focused-scan "A Served Scan Target Is One a Commit Would Accept, Priced
// at the Duration a Commit Would Freeze").
type ScanTarget struct {
	HostId     string             `json:"hostId"`
	Kind       string             `json:"kind"`
	DurationMs common.WorldMillis `json:"durationMs"`
}

// ScanTargets serves GET /v1/fleets/:fleetId/scan-targets — the set of
// hosts a focused-scan commit by fleetId would accept right now, priced at
// the duration that commit would freeze (focused-scan "Eligible Scan
// Targets Are Served Per Fleet, To Their Owner Alone"). Ownership is the
// caller's job (fleet.Handler.commandedFleetId, mirroring every other
// command endpoint): this method assumes fleetId already resolved to an
// owned, settled fleet.
//
// The set is empty — never an error — when the scanning fleet is itself in
// lane transit, when its sensor channel is already claimed by a running
// sweep, or when nothing in reach passes the shared eligibility helpers
// (focused-scan "A fleet in lane transit has an empty target set", "A fleet
// already running a sweep has an empty target set", "A system with nothing
// in reach yields an empty set, not an error").
//
// Excluded, with no entry and no reason field for any of them (focused-scan
// "A Served Scan Target Is One a Commit Would Accept..."): the reading
// fleet itself, every derived belt member, every foreign fleet, every own
// fleet in lane transit, every host beyond disclosure.FocusedScanRange, and
// every host the star occludes. Every inclusion/exclusion decision and
// every served duration flow through the SAME scanHostPosition/scanGeometry/
// roundTripMs calls Scan's commit path uses (task 3.1) — there is no second
// implementation to drift from the commit's own acceptance.
//
// Ordering is ascending by hostId, one merged list (link8b-impl-contract.md
// §1.1) — not required by any scenario, pinned so the list is stable across
// reads. The response never carries a world time (task 3.7/9.2b): no client
// requirement measures anything against this read's own world time.
func (s *Service) ScanTargets(ctx context.Context, fleetId string) ([]ScanTarget, error) {
	f, err := s.load(ctx, fleetId)
	if err != nil {
		return nil, err
	}
	if f.Jump != nil || f.ActiveScanId != "" {
		return []ScanTarget{}, nil
	}

	bt, err := s.bodiesFor(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}

	now := s.clock.Now()
	from, err := s.Position(ctx, f, bt)
	if err != nil {
		return nil, err
	}
	starPos, err := space.Position(bt, bt.StarId(), now)
	if err != nil {
		return nil, fmt.Errorf("fleet: resolving star position for scan-target geometry: %w", err)
	}
	starSize := bt.StarSize()

	var out []ScanTarget

	// EligibleIds (system/bodies.go), not the raw Ids() this package's own
	// structural guard forbids (fleet/body_source_test.go): the belt-member
	// and self exclusions are the structural half of "never a derived belt
	// member, never the reading fleet itself", applied before any position
	// is even resolved.
	candidates := bt.EligibleIds(func(bodyId string) bool {
		return !system.IsDerivedBeltMember(bodyId) && bodyId != f.Id
	})
	for _, bodyId := range candidates {
		hostPos, err := space.Position(bt, bodyId, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: resolving scan-target body position for %q: %w", bodyId, err)
		}
		if scanGeometry(from, hostPos, starPos, starSize) != nil {
			continue
		}
		out = append(out, ScanTarget{
			HostId: bodyId, Kind: ScanTargetKindBody,
			DurationMs: roundTripMs(hostPos.Sub(from).Length()),
		})
	}

	fleets, err := s.dao.ListBySystem(ctx, f.SystemId)
	if err != nil {
		return nil, err
	}
	for i := range fleets {
		host := &fleets[i]
		if host.Id == f.Id || host.CorporationId != f.CorporationId || host.Jump != nil {
			continue
		}
		hostPos, err := space.StatePosition(bt, host.State, now)
		if err != nil {
			return nil, fmt.Errorf("fleet: resolving scan-target fleet position for %q: %w", host.Id, err)
		}
		if scanGeometry(from, hostPos, starPos, starSize) != nil {
			continue
		}
		out = append(out, ScanTarget{
			HostId: host.Id, Kind: ScanTargetKindFleet,
			DurationMs: roundTripMs(hostPos.Sub(from).Length()),
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].HostId < out[j].HostId })
	if out == nil {
		out = []ScanTarget{}
	}
	return out, nil
}
