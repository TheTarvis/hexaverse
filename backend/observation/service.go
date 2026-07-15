package observation

import (
	"context"
	"fmt"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
)

// scanType is the action dispatch key for the scan verb. The scan COMMITS
// through the fleet (the actor owner, mirroring burn — on the SENSOR channel,
// #0006 Decision #19) and RESOLVES here (the reveal owner): resolution mints
// the observations as ResolveResult.Writes, applied exactly-once in the
// resolve transaction (#0006).
const scanType = "scan"

// Service is the fog-of-war domain: the fog-filter other reads call to project
// per requester, plus the reveal writers (the scan resolver, ambient-on-move).
// It reads live positions, interior geometry, and the lane graph through
// injected interfaces so it never imports fleet/system/galaxy (no cycles).
// ActionSource is the action-spine dependency the echo disc reads: loading a
// running scan by id to learn its window and pinned origin. The shared
// action.Service implements it; RegisterResolvers captures it.
type ActionSource interface {
	Get(ctx context.Context, id string) (*action.Action, error)
}

type Service struct {
	dao       Dao
	fleets    FleetSource
	interiors InteriorSource
	lanes     LaneSource
	actions   ActionSource
	clock     common.WorldTime
	sensor    SensorParams
	scan      ScanParams
}

func NewService(fleets FleetSource, interiors InteriorSource, lanes LaneSource) *Service {
	return &Service{
		dao:       NewDao(),
		fleets:    fleets,
		interiors: interiors,
		lanes:     lanes,
		clock:     common.WorldClock(),
		sensor:    DefaultSensorParams(),
		scan:      DefaultScanParams(),
	}
}

func NewServiceWith(dao Dao, fleets FleetSource, interiors InteriorSource, lanes LaneSource, clock common.WorldTime) *Service {
	return &Service{
		dao:       dao,
		fleets:    fleets,
		interiors: interiors,
		lanes:     lanes,
		clock:     clock,
		sensor:    DefaultSensorParams(),
		scan:      DefaultScanParams(),
	}
}

// WithParams overrides the tuning (tests pin deterministic beam geometry).
func (s *Service) WithParams(sensor SensorParams, scan ScanParams) *Service {
	s.sensor = sensor
	s.scan = scan
	return s
}

// ScanParams exposes the commit-time tuning the fleet needs to set a scan's ETA.
func (s *Service) ScanParams() ScanParams { return s.scan }

// RegisterResolvers wires the scan resolver onto the shared action service, so
// the same instance that commits and sweeps knows how to mint a scan's
// observations. Call once at startup (like fleet.RegisterResolvers). It also
// captures the service as the echo disc's ActionSource — the fog read loads a
// running scan through the SAME spine that will resolve it, so the live front
// and the durable mint can never disagree about the scan's window.
func (s *Service) RegisterResolvers(a *action.Service) {
	a.RegisterResolver(scanType, action.KindMutating, s.ScanResolver())
	s.actions = a
}

// --- fog filter (read projection) -------------------------------------------

// Coverage is a Corporation's live sensor union in one system: the set of hexes
// inside any of its live discs WITH line of sight (#0006 Decision #16 — a hex
// behind a planet is outside the union even inside the radius). A disc is a
// unit's passive bubble, or a running scan's echo front (the radial-echo
// revision: the region whose echoes have already returned reads LIVE while the
// scan runs). Computed at read time, never stored.
type Coverage struct {
	discs     []coverageDisc
	occluders map[board.Hex]bool
}

// coverageDisc is one live sensor disc: a centre and its own radius (ambient
// bubbles are small and ride units; an echo disc grows from a pinned origin).
type coverageDisc struct {
	center board.Hex
	radius int
}

// NewCoverage builds an occluder-free coverage set from explicit unit hexes —
// for tests and callers that already hold resolved positions.
func NewCoverage(radius int, centers ...board.Hex) Coverage {
	c := Coverage{}
	for _, ctr := range centers {
		c.discs = append(c.discs, coverageDisc{center: ctr, radius: radius})
	}
	return c
}

// NewCoverageWithOccluders builds a coverage set with the large-body hexes that
// shadow it.
func NewCoverageWithOccluders(radius int, occluders []board.Hex, centers ...board.Hex) Coverage {
	occ := make(map[board.Hex]bool, len(occluders))
	for _, h := range occluders {
		occ[h] = true
	}
	c := NewCoverage(radius, centers...)
	c.occluders = occ
	return c
}

// WithDisc returns the coverage with one more live disc — an echo front.
func (c Coverage) WithDisc(center board.Hex, radius int) Coverage {
	c.discs = append(c.discs, coverageDisc{center: center, radius: radius})
	return c
}

// Covers reports whether a hex sits inside the live sensor union: within some
// disc's radius AND on a clear line of sight from its centre.
func (c Coverage) Covers(h board.Hex) bool {
	for _, d := range c.discs {
		if board.Distance(d.center, h) <= d.radius && board.LineOfSight(d.center, h, c.occluders) {
			return true
		}
	}
	return false
}

// Empty reports whether the corp has no coverage in the system.
func (c Coverage) Empty() bool { return len(c.discs) == 0 }

// Coverage computes the corp's live sensor union in a system from its units'
// current positions, shadowed by the system's large bodies at `now`. Passive
// sensors ride any moving unit — drifting or burning (Travis, 2026-07-10) —
// so every own fleet in the system contributes a bubble; a fleet with a
// RUNNING scan additionally contributes its echo disc: everything within the
// returned-echo front of the emission hex pinned at commit is live until
// resolution mints the durable memory at eta (#0006 Decision #26 — the pulse
// stays where it was fired; the ship moves on and still collects the
// returns).
func (s *Service) Coverage(ctx context.Context, cid, systemID string, now common.WorldMillis) (Coverage, error) {
	fleets, err := s.fleets.FleetsForCorp(ctx, cid, now)
	if err != nil {
		return Coverage{}, err
	}
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return Coverage{}, err
	}
	cov := Coverage{occluders: occluderHexes(feats, now)}
	for _, f := range fleets {
		if f.SystemId != systemID {
			continue
		}
		cov.discs = append(cov.discs, coverageDisc{center: f.Hex, radius: s.sensor.AmbientRadius})
		if disc, ok := s.echoDisc(ctx, f, systemID, now); ok {
			cov.discs = append(cov.discs, disc)
		}
	}
	return cov, nil
}

// echoDisc computes a fleet's running-scan echo disc at `now`, if it has one:
// centred on the EMISSION HEX pinned in the action's params at commit — the
// pulse grows from where it was fired and stays there (#0006 Decision #26;
// supersedes the live-centred antenna of #22) — radius = how far the front
// has travelled (BoardRadius × elapsed/duration — ScanDuration IS the rim
// round-trip). A scan committed before the origin was pinned falls back to
// the unit's live hex. Nothing to add for a fleet not scanning, a scan
// already past its eta (resolution owns it now), or when no action source is
// wired.
func (s *Service) echoDisc(ctx context.Context, f FleetPos, systemID string, now common.WorldMillis) (coverageDisc, bool) {
	if f.ActiveScanId == "" || s.actions == nil {
		return coverageDisc{}, false
	}
	a, err := s.actions.Get(ctx, f.ActiveScanId)
	if err != nil || a == nil {
		return coverageDisc{}, false
	}
	if a.Type != scanType || a.Status != action.StatusRunning || a.Scope != systemID {
		return coverageDisc{}, false
	}
	duration := a.Eta - a.CommittedAt
	if duration <= 0 || now < a.CommittedAt {
		return coverageDisc{}, false
	}
	elapsed := now - a.CommittedAt
	if elapsed > duration {
		elapsed = duration
	}
	front := int(int64(common.Tuning().BoardRadius) * int64(elapsed) / int64(duration))
	center := f.Hex
	if origin, ok := paramHex(a.Params, "origin"); ok {
		center = origin
	}
	return coverageDisc{center: center, radius: front}, true
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

// ChartedLanes returns the corp's charted lane set (laneId → true) — the
// graph read's lane filter and routing's adjacency both key on it (#0006
// Decision #17).
func (s *Service) ChartedLanes(ctx context.Context, cid string) (map[string]bool, error) {
	lanes, err := s.dao.ListLanes(ctx, cid)
	if err != nil {
		return nil, err
	}
	m := make(map[string]bool, len(lanes))
	for _, l := range lanes {
		m[l.LaneId] = true
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
// fleet sits inside the requester's live, LOS-filtered sensor union.
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
// firestore tags without importing fleet). State computes the beam's origin at
// eta — a burning fleet scans from wherever its burn has it at the frozen
// effect time.
type scanActor struct {
	CorporationId string              `firestore:"corporationId"`
	SystemId      string              `firestore:"systemId"`
	State         board.MovementState `firestore:"state"`
}

// scanReveal is everything one scan yields — built once, persisted either as
// resolve-transaction DocWrites (the production path) or through the DAO
// (MintScan).
type scanReveal struct {
	features []FeatureObservation
	lanes    []LaneObservation
	rumors   []SystemObservation
}

// ScanResolver is the scan verb's per-type effect: when a scan's ETA passes,
// resolution runs the 360° sweep — occluder positions and the feature set
// evaluated AT ETA (r.At), so a scan resolved hours late mints the same
// snapshot as one on time — and mints per-feature detail for every feature
// with clear line of sight, plus the system's charted lanes (#0006 Decision
// #17: lane detection is subspace — never occluded). The sweep's origin is
// the EMISSION HEX pinned in params at commit (#0006 Decision #26 — the
// pulse stays where it was fired; echoDisc grows the live front from the
// same hex, so the mint is exactly what the front swept): a scan committed
// before the origin was pinned falls back to the fleet's position at eta. If
// the fleet has left the origin system by eta, the scan fizzles: done, an
// interrupted outcome, nothing minted (0006/S9). The writes are idempotent
// (keyed per feature/lane, monotonic tiers), so action applies them with
// MergeAll in the resolve transaction.
func (s *Service) ScanResolver() action.ResolveFunc {
	return func(ctx context.Context, r action.Resolution) (action.ResolveResult, error) {
		var actor scanActor
		if err := r.DecodeActor(&actor); err != nil {
			return action.ResolveResult{}, err
		}
		originSys := paramString(r.Action.Params, "systemId")
		if originSys == "" {
			originSys = r.Action.Scope
		}
		fizzle := func(why string) action.ResolveResult {
			return action.ResolveResult{Outcome: "scan interrupted — " + why}
		}
		if actor.SystemId != originSys {
			return fizzle("the fleet left " + originSys + " before completion"), nil
		}
		feats, err := s.interiors.Features(ctx, originSys)
		if err != nil {
			return action.ResolveResult{}, err
		}
		origin, onBoard := paramHex(r.Action.Params, "origin")
		if !onBoard {
			origin, onBoard = scanOrigin(actor.State, feats, r.At)
		}
		if !onBoard {
			return fizzle("the fleet had no board position at the scan's eta"), nil
		}
		reveal, err := s.buildScan(ctx, actor.CorporationId, originSys, feats, origin, r.At)
		if err != nil {
			return action.ResolveResult{}, err
		}
		return action.ResolveResult{
			Outcome: fmt.Sprintf("scanned %s: %d features, %d lanes charted",
				originSys, len(reveal.features), len(reveal.lanes)),
			Writes: s.revealWrites(actor.CorporationId, originSys, reveal),
		}, nil
	}
}

// MintScan writes a scan's observations directly through the DAO — the non-
// action path (used by tests and any future non-resolve caller). The production
// scan mints through the resolver's Writes; both derive the SAME records from
// buildScan.
func (s *Service) MintScan(ctx context.Context, cid, systemID string, origin board.Hex, at common.WorldMillis) error {
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return err
	}
	reveal, err := s.buildScan(ctx, cid, systemID, feats, origin, at)
	if err != nil {
		return err
	}
	for _, fo := range reveal.features {
		if err := s.dao.UpsertFeatureObservation(ctx, cid, systemID, fo); err != nil {
			return err
		}
	}
	for _, lo := range reveal.lanes {
		if err := s.dao.UpsertLane(ctx, cid, lo); err != nil {
			return err
		}
	}
	for _, so := range reveal.rumors {
		if err := s.dao.UpsertSystemObservation(ctx, cid, so); err != nil {
			return err
		}
	}
	return nil
}

// buildScan is the single source of truth for WHAT a scan reveals (#0006
// Decisions #16/#17/#21): the 360° sweep mints board-tier records for every
// feature with clear line of sight from the origin (the first occluder on a
// line is itself seen; what's in shadow stays dark), charts every incident
// lane, and rumors each lane's far endpoint — monotonically, never above
// rumored. No graph tier is granted to the scanned system itself, and nothing
// ever writes `surveyed`.
func (s *Service) buildScan(ctx context.Context, cid, systemID string, feats []FeatureGeom, origin board.Hex, at common.WorldMillis) (scanReveal, error) {
	var out scanReveal

	occ := occluderHexes(feats, at)
	for _, f := range feats {
		h := featureGeomHexAt(f, at)
		if !board.LineOfSight(origin, h, occ) {
			continue
		}
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
		out.features = append(out.features, fo)
	}

	laneEnds, err := s.lanes.LanesOf(ctx, systemID)
	if err != nil {
		return scanReveal{}, err
	}
	if len(laneEnds) > 0 {
		tiers, err := s.SystemTiers(ctx, cid)
		if err != nil {
			return scanReveal{}, err
		}
		for _, le := range laneEnds {
			out.lanes = append(out.lanes, LaneObservation{LaneId: le.LaneId, Via: ViaScanned, AsOf: at})
			if le.OtherSystemId == systemID || tiers[le.OtherSystemId].AtLeast(TierRumored) {
				continue
			}
			out.rumors = append(out.rumors, SystemObservation{
				SystemId: le.OtherSystemId, Tier: TierRumored, AsOf: at,
			})
		}
	}
	return out, nil
}

// revealWrites converts a scan's reveal into action.DocWrites for the resolve
// transaction.
func (s *Service) revealWrites(cid, systemID string, r scanReveal) []action.DocWrite {
	writes := make([]action.DocWrite, 0, len(r.features)+len(r.lanes)+len(r.rumors))
	for _, fo := range r.features {
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
	for _, lo := range r.lanes {
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, lanesCollection, lo.LaneId},
			Data: map[string]interface{}{"laneId": lo.LaneId, "via": lo.Via, "asOf": int64(lo.AsOf)},
		})
	}
	// Rumor writes ride MergeAll like the rest; monotonicity is preserved by
	// the tiers filter in buildScan (never overwriting a known-better tier).
	for _, so := range r.rumors {
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, observationsCollection, so.SystemId},
			Data: map[string]interface{}{"systemId": so.SystemId, "tier": string(so.Tier), "asOf": int64(so.AsOf)},
		})
	}
	return writes
}

// AmbientWrites is the passive-sensor reveal for a resolved move (#0006 Decision
// #14, path-swept): for each feature whose current position falls inside the
// swept sensor bubble — with line of sight from some swept hex (#0006 Decision
// #16) — mint a presence-only memory (geometry + asOf, NO composition — ambient
// records that a body is there and where, never its worth; scan is the only
// minter of that). Keyed per feature, so repeat passes are idempotent
// overwrites, and MergeAll preserves any scanned Detail already stored.
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
	occ := occluderHexes(feats, at)
	var writes []action.DocWrite
	for _, f := range feats {
		if !sweptCovers(path, s.sensor.AmbientRadius, featureGeomHexAt(f, at), occ) {
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

// RevealArrival writes the arrival reveal directly through the DAO
// (destination → Explored, nothing else) — the non-action path spawn (#0009)
// uses: waking IS arriving. Onward lanes are NOT charted (#0006 Decision #17,
// 2026-07-14): finding the roads is the first scan's job — the wake-up beat.
// Idempotent — re-running never lowers a tier — so it's safe on an idempotent
// re-spawn.
func (s *Service) RevealArrival(ctx context.Context, cid, destSystemID string, at common.WorldMillis) error {
	return s.dao.UpsertSystemObservation(ctx, cid, SystemObservation{
		SystemId: destSystemID, Tier: TierExplored, AsOf: at,
	})
}

// ArrivalWrites builds the destination-on-arrival reveal (#0008, revised
// 2026-07-14 per #0006 Decision #17): the destination → Explored, and the
// lanes the trip actually crossed charted `via: traveled`. No onward-lane
// rumor — arrival explores, scanning finds the roads. Returned as
// action.DocWrites so a trip's resolver applies them in its resolve
// transaction (exactly-once with the motion settle). Explored is the top tier,
// so a blind MergeAll can never lower it; lane docs are keyed by laneId, so
// re-resolution is an idempotent overwrite. asOf = arrival time.
func (s *Service) ArrivalWrites(cid, destSystemID string, traveledLaneIds []string, at common.WorldMillis) []action.DocWrite {
	writes := []action.DocWrite{{
		Path: []string{corporationsCollection, cid, observationsCollection, destSystemID},
		Data: map[string]interface{}{
			"systemId": destSystemID,
			"tier":     string(TierExplored),
			"asOf":     int64(at),
		},
	}}
	for _, laneID := range traveledLaneIds {
		writes = append(writes, action.DocWrite{
			Path: []string{corporationsCollection, cid, lanesCollection, laneID},
			Data: map[string]interface{}{"laneId": laneID, "via": ViaTraveled, "asOf": int64(at)},
		})
	}
	return writes
}

// --- geometry helpers --------------------------------------------------------

// scanOrigin is the LEGACY beam origin — the fleet's board hex at the scan's
// eta, answered from the effective state (board.StateAt) — kept only as the
// fallback for scans committed before the emission hex was pinned in params
// (#0006 Decision #26). A fleet docked to an orbiting body scans from
// wherever that body IS at eta; a fleet out on a lane (or holding mid-lane)
// has no board position — the scan fizzles.
func scanOrigin(state board.MovementState, feats []FeatureGeom, at common.WorldMillis) (board.Hex, bool) {
	eff := board.StateAt(state, at)
	switch eff.Mode {
	case board.ModeDocked:
		if eff.Docked == nil {
			return board.Hex{}, false
		}
		for _, f := range feats {
			if f.Id == eff.Docked.ParentId {
				return featureGeomHexAt(f, at), true
			}
		}
		return board.Hex{}, false
	case board.ModeLaneHold:
		return board.Hex{}, false
	case board.ModeLaneTransit:
		if eff.LaneTransit == nil || eff.LaneTransit.BoardLeg == nil || at >= eff.LaneTransit.BoardLeg.GateEta {
			return board.Hex{}, false
		}
		return board.ShipPos(eff, at)
	default:
		return board.ShipPos(eff, at)
	}
}

// occluderHexes is the large-body shadow set at a world time (#0006 Decision
// #16): every Occludes feature at its computed position.
func occluderHexes(feats []FeatureGeom, at common.WorldMillis) map[board.Hex]bool {
	var occ map[board.Hex]bool
	for _, f := range feats {
		if !f.Occludes {
			continue
		}
		if occ == nil {
			occ = map[board.Hex]bool{}
		}
		occ[featureGeomHexAt(f, at)] = true
	}
	return occ
}

// featureGeomHexAt is a feature's hex at a world time (orbital position or anchor).
func featureGeomHexAt(f FeatureGeom, at common.WorldMillis) board.Hex {
	if f.Elements != nil {
		return board.OrbState(*f.Elements, at)
	}
	return f.Anchor
}

// sweptCovers reports whether a hex sits within radius — and line of sight —
// of any hex on the path.
func sweptCovers(path []board.Hex, radius int, h board.Hex, occ map[board.Hex]bool) bool {
	for _, p := range path {
		if board.Distance(p, h) <= radius && board.LineOfSight(p, h, occ) {
			return true
		}
	}
	return false
}

// paramString reads a frozen string param.
func paramString(params map[string]interface{}, key string) string {
	s, _ := params[key].(string)
	return s
}

// paramHex reads a frozen hex param — either a board.Hex kept in memory (unit
// tests, same-process commits) or the {q, r} map a Firestore round-trip turns
// it into (integers come back as int64).
func paramHex(params map[string]interface{}, key string) (board.Hex, bool) {
	switch v := params[key].(type) {
	case board.Hex:
		return v, true
	case map[string]interface{}:
		q, qok := paramCoord(v["q"])
		r, rok := paramCoord(v["r"])
		if qok && rok {
			return board.Hex{Q: q, R: r}, true
		}
	}
	return board.Hex{}, false
}

// paramCoord normalizes the numeric types a stored coordinate can come back as.
func paramCoord(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	}
	return 0, false
}
