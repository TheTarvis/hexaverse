package observation

import (
	"context"
	"fmt"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// scanType is the action dispatch key for the scan verb. The scan COMMITS
// through the fleet (the actor owner, mirroring burn) and RESOLVES here (the
// reveal owner): resolution mints the observations as ResolveResult.Writes,
// applied exactly-once in the resolve transaction (#0006).
const scanType = "scan"

// Service is the fog-of-war domain: the fog-filter other reads call to project
// per requester, plus the reveal writers (the scan resolver, ambient-on-move).
// It reads live positions and interior geometry through injected interfaces so
// it never imports fleet/system (no cycles).
type Service struct {
	dao       Dao
	fleets    FleetSource
	interiors InteriorSource
	clock     common.WorldTime
	sensor    SensorParams
	scan      ScanParams
}

func NewService(fleets FleetSource, interiors InteriorSource) *Service {
	return &Service{
		dao:       NewDao(),
		fleets:    fleets,
		interiors: interiors,
		clock:     common.WorldClock(),
		sensor:    DefaultSensorParams(),
		scan:      DefaultScanParams(),
	}
}

func NewServiceWith(dao Dao, fleets FleetSource, interiors InteriorSource, clock common.WorldTime) *Service {
	return &Service{
		dao:       dao,
		fleets:    fleets,
		interiors: interiors,
		clock:     clock,
		sensor:    DefaultSensorParams(),
		scan:      DefaultScanParams(),
	}
}

// ScanParams exposes the commit-time tuning the fleet needs to set a scan's ETA.
func (s *Service) ScanParams() ScanParams { return s.scan }

// RegisterResolvers wires the scan resolver onto the shared action service, so
// the same instance that commits and sweeps knows how to mint a scan's
// observations. Call once at startup (like fleet.RegisterResolvers).
func (s *Service) RegisterResolvers(a *action.Service) {
	a.RegisterResolver(scanType, action.KindMutating, s.ScanResolver())
}

// --- fog filter (read projection) -------------------------------------------

// Coverage is a Corporation's live sensor union in one system: the set of hexes
// inside any of its units' passive bubbles. Computed at read time, never stored
// (#0006 Decision — Visible is computed, Remembered is stored).
type Coverage struct {
	centers []board.Hex
	radius  int
}

// NewCoverage builds a coverage set from explicit unit hexes — for tests and
// callers that already hold resolved positions.
func NewCoverage(radius int, centers ...board.Hex) Coverage {
	return Coverage{centers: centers, radius: radius}
}

// Covers reports whether a hex sits inside the live sensor union.
func (c Coverage) Covers(h board.Hex) bool {
	for _, ctr := range c.centers {
		if board.Distance(ctr, h) <= c.radius {
			return true
		}
	}
	return false
}

// Empty reports whether the corp has no coverage in the system.
func (c Coverage) Empty() bool { return len(c.centers) == 0 }

// Coverage computes the corp's live sensor union in a system from its units'
// current positions. Passive sensors ride any moving unit — drifting or burning
// (Travis, 2026-07-10) — so every own fleet in the system contributes a bubble.
func (s *Service) Coverage(ctx context.Context, cid, systemID string, now common.WorldMillis) (Coverage, error) {
	fleets, err := s.fleets.FleetsForCorp(ctx, cid, now)
	if err != nil {
		return Coverage{}, err
	}
	cov := Coverage{radius: s.sensor.AmbientRadius}
	for _, f := range fleets {
		if f.SystemId == systemID {
			cov.centers = append(cov.centers, f.Hex)
		}
	}
	return cov, nil
}

// SystemTiers folds the corp's stored graph observations to a systemId→tier map.
// Systems absent from the map are star-visible (the free baseline); the caller
// defaults them. Monotonic by construction (the store never lowers a tier).
func (s *Service) SystemTiers(ctx context.Context, cid string) (map[string]Tier, error) {
	obs, err := s.dao.ListSystemObservations(ctx, cid)
	if err != nil {
		return nil, err
	}
	m := make(map[string]Tier, len(obs))
	for _, o := range obs {
		m[o.SystemId] = o.Tier
	}
	return m, nil
}

// RememberedFeatures returns the corp's stored board-tier memory for a system,
// keyed by featureId. A consumer draws these at their CURRENT computed position
// (from Elements) with activity/detail frozen at AsOf.
func (s *Service) RememberedFeatures(ctx context.Context, cid, systemID string) (map[string]FeatureMemory, error) {
	fobs, err := s.dao.ListFeatureObservations(ctx, cid, systemID)
	if err != nil {
		return nil, err
	}
	m := make(map[string]FeatureMemory, len(fobs))
	for _, o := range fobs {
		m[o.FeatureId] = FeatureMemory{
			Elements: o.Elements,
			Anchor:   o.Anchor,
			Detail:   o.Detail,
			Activity: o.Activity,
			AsOf:     o.AsOf,
		}
	}
	return m, nil
}

// FleetVisibleTo answers the #0004 delegated audience rule: a requester sees a
// fleet if it's their own (own perception is never fogged, anywhere) or if the
// fleet sits inside the requester's live sensor union.
func (s *Service) FleetVisibleTo(ctx context.Context, requesterCid string, f FleetPos, now common.WorldMillis) (bool, error) {
	if f.CorporationId == requesterCid {
		return true, nil
	}
	cov, err := s.Coverage(ctx, requesterCid, f.SystemId, now)
	if err != nil {
		return false, err
	}
	return cov.Covers(f.Hex), nil
}

// --- reveal writes ----------------------------------------------------------

// scanActor is the subset of the fleet doc the scan resolver needs (decoded via
// firestore tags without importing fleet).
type scanActor struct {
	CorporationId string `firestore:"corporationId"`
	SystemId      string `firestore:"systemId"`
}

// ScanResolver is the scan verb's per-type effect: when a scan's ETA passes,
// resolution mints the surveyed observation + per-feature detail for what the
// scan touched, timestamped asOf:eta (r.At). Because state-at-eta is
// deterministic (immutable interior geometry; activity folds the ledger ≤ eta),
// a scan resolved hours late mints the same snapshot as one on time. The writes
// are idempotent (monotonic tier / keyed per feature), so action applies them
// with MergeAll in the resolve transaction.
func (s *Service) ScanResolver() action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var actor scanActor
		if err := r.DecodeActor(&actor); err != nil {
			return action.ResolveResult{}, err
		}
		feats, err := s.interiors.Features(ctx, actor.SystemId)
		if err != nil {
			return action.ResolveResult{}, err
		}
		writes := s.scanWrites(actor.CorporationId, actor.SystemId, feats, r.At)
		return action.ResolveResult{
			Outcome: fmt.Sprintf("surveyed %s (%d features)", actor.SystemId, len(feats)),
			Writes:  writes,
		}, nil
	}
}

// MintScan writes a scan's observations directly through the DAO — the non-
// action path (used by tests and any future non-resolve caller). The production
// scan mints through the resolver's Writes; both derive the SAME records from
// buildScanObservations.
func (s *Service) MintScan(ctx context.Context, cid, systemID string, at common.WorldMillis) error {
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return err
	}
	sysObs, featObs := buildScanObservations(systemID, feats, at)
	if err := s.dao.UpsertSystemObservation(ctx, cid, sysObs); err != nil {
		return err
	}
	for _, fo := range featObs {
		if err := s.dao.UpsertFeatureObservation(ctx, cid, systemID, fo); err != nil {
			return err
		}
	}
	return nil
}

// AmbientWrites is the passive-sensor reveal for a resolved move (#0006 Decision
// #14, path-swept): for each feature whose current position falls inside the
// swept sensor bubble, mint a presence-only memory (geometry + asOf, NO
// composition — ambient records that a body is there and where, never its worth;
// scan is the only minter of that). Keyed per feature, so repeat passes are
// idempotent overwrites, and MergeAll preserves any scanned Detail already stored.
// Returned as action.DocWrites so the burn resolver applies them in its resolve
// transaction. Passive sensors ride any moving unit — drifting or burning.
func (s *Service) AmbientWrites(ctx context.Context, cid, systemID string, path []board.Hex, at common.WorldMillis) ([]action.DocWrite, error) {
	if len(path) == 0 || cid == "" {
		return nil, nil
	}
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return nil, err
	}
	var writes []action.DocWrite
	for _, f := range feats {
		if !sweptCovers(path, s.sensor.AmbientRadius, featureGeomHexAt(f, at)) {
			continue
		}
		data := map[string]interface{}{"featureId": f.Id, "asOf": int64(at)}
		if f.Elements != nil {
			data["elements"] = f.Elements
		} else {
			anchor := f.Anchor
			data["anchor"] = anchor
		}
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, observationsCollection, systemID, featuresCollection, f.Id},
			Data: data,
		})
	}
	return writes, nil
}

// ArrivalWrites builds the destination-on-arrival reveal (#0008): the destination
// → Explored, and each onward-lane neighbour not already at least Rumored →
// Rumored. Returned as action.DocWrites so a trip's resolver applies them in its
// resolve transaction (exactly-once with the motion settle). Explored is the top
// tier (a blind MergeAll can never lower it); the onward writes are filtered by
// the passed tiers so they never lower a neighbour you already know better —
// keeping monotonicity without a per-doc read. asOf = arrival time.
func (s *Service) ArrivalWrites(cid, destSystemID string, onward []string, tiers map[string]Tier, at common.WorldMillis) []action.DocWrite {
	writes := []action.DocWrite{{
		Path: []string{corporationsCollection, cid, observationsCollection, destSystemID},
		Data: map[string]interface{}{
			"systemId": destSystemID,
			"tier":     string(TierExplored),
			"asOf":     int64(at),
		},
	}}
	for _, nb := range onward {
		if nb == destSystemID || tiers[nb].AtLeast(TierRumored) {
			continue
		}
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, observationsCollection, nb},
			Data: map[string]interface{}{
				"systemId": nb,
				"tier":     string(TierRumored),
				"asOf":     int64(at),
			},
		})
	}
	return writes
}

// featureGeomHexAt is a feature's hex at a world time (orbital position or anchor).
func featureGeomHexAt(f FeatureGeom, at common.WorldMillis) board.Hex {
	if f.Elements != nil {
		return board.OrbState(*f.Elements, at)
	}
	return f.Anchor
}

// sweptCovers reports whether a hex sits within radius of any hex on the path.
func sweptCovers(path []board.Hex, radius int, h board.Hex) bool {
	for _, p := range path {
		if board.Distance(p, h) <= radius {
			return true
		}
	}
	return false
}

// scanWrites converts a scan's observation records into action.DocWrites for the
// resolve transaction.
func (s *Service) scanWrites(cid, systemID string, feats []FeatureGeom, at common.WorldMillis) []action.DocWrite {
	sysObs, featObs := buildScanObservations(systemID, feats, at)
	writes := make([]action.DocWrite, 0, len(featObs)+1)
	writes = append(writes, action.DocWrite{
		Path: []string{corporationsCollection, cid, observationsCollection, systemID},
		Data: map[string]interface{}{
			"systemId": sysObs.SystemId,
			"tier":     string(sysObs.Tier),
			"asOf":     int64(sysObs.AsOf),
			"snapshot": sysObs.Snapshot,
		},
	})
	for _, fo := range featObs {
		data := map[string]interface{}{
			"featureId": fo.FeatureId,
			"asOf":      int64(fo.AsOf),
		}
		if fo.Elements != nil {
			data["elements"] = fo.Elements
		}
		if fo.Anchor != nil {
			data["anchor"] = fo.Anchor
		}
		if fo.Detail != nil {
			data["detail"] = fo.Detail
		}
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, observationsCollection, systemID, featuresCollection, fo.FeatureId},
			Data: data,
		})
	}
	return writes
}

// buildScanObservations is the single source of truth for WHAT a scan reveals:
// the surveyed graph-tier record + a board-tier record per feature (geometry +
// composition detail), timestamped `at`. The slice scan is system-wide
// (ScanParams.Radius 0), so it touches every feature; a bounded radius is a
// deferred knob.
func buildScanObservations(systemID string, feats []FeatureGeom, at common.WorldMillis) (SystemObservation, []FeatureObservation) {
	sysObs := SystemObservation{
		SystemId: systemID,
		Tier:     DefaultScanParams().GrantsTier,
		AsOf:     at,
		Snapshot: &SystemSnapshot{FeatureCount: len(feats)},
	}
	featObs := make([]FeatureObservation, 0, len(feats))
	for _, f := range feats {
		fo := FeatureObservation{
			FeatureId: f.Id,
			Elements:  f.Elements,
			Detail:    f.Detail,
			AsOf:      at,
		}
		if f.Elements == nil {
			anchor := f.Anchor
			fo.Anchor = &anchor
		}
		featObs = append(featObs, fo)
	}
	return sysObs, featObs
}
