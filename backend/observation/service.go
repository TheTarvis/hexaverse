package observation

import (
	"context"
	"fmt"

	"hexaverse/action"
	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/polar"

	"github.com/rs/zerolog/log"
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

// Coverage is a Corporation's live sensor union in one system: the set of
// cells inside any of its live discs WITH line of sight (#0006 Decision #16 —
// a cell behind a planet is outside the union even inside the radius). A disc
// is a unit's passive bubble, or a running scan's echo front (the
// radial-echo revision: the region whose echoes have already returned reads
// LIVE while the scan runs). Computed at read time, never stored.
//
// Each disc is materialized ONCE, at construction, as a bounded-radius cell
// set (board.Within — design.md Decision 6), rather than answered per-query
// with an unbounded board.Distance BFS. Covers is then a set lookup per disc
// plus the LOS check.
type Coverage struct {
	discs     []coverageDisc
	occluders []board.Occluder
	sched     polar.Schedule
}

// coverageDisc is one live sensor disc, materialized: its centre (for the LOS
// check) and the bounded-radius cell set board.Within already computed.
type coverageDisc struct {
	center board.Cell
	cells  map[board.Cell]bool
}

// NewCoverage builds an occluder-free coverage set from explicit unit cells —
// for tests and callers that already hold resolved positions.
func NewCoverage(radius int, sched polar.Schedule, centers ...board.Cell) Coverage {
	c := Coverage{sched: sched}
	for _, ctr := range centers {
		c = c.WithDisc(ctr, radius)
	}
	return c
}

// NewCoverageWithOccluders builds a coverage set with the large-body cells
// that shadow it.
func NewCoverageWithOccluders(radius int, occluders []board.Occluder, sched polar.Schedule, centers ...board.Cell) Coverage {
	c := NewCoverage(radius, sched, centers...)
	c.occluders = occluders
	return c
}

// NewSweptCoverage materializes one bounded-radius disc per DISTINCT cell on
// path — the sweep's countable unit of work (design.md Decision 6, tasks.md
// 4.7): at most one disc per distinct path cell, never one per
// (path cell, feature) pair, however many features are checked against it
// afterward. AmbientWrites is built on this; it is exported so the bounded-
// work scenario can pin DiscsMaterialized() directly, deterministically,
// without timing anything.
func NewSweptCoverage(path []board.Cell, radius int, occluders []board.Occluder, sched polar.Schedule) Coverage {
	c := Coverage{sched: sched, occluders: occluders}
	seen := map[board.Cell]bool{}
	for _, p := range path {
		canon := board.Canon(p, sched)
		if seen[canon] {
			continue
		}
		seen[canon] = true
		c = c.WithDisc(p, radius)
	}
	return c
}

// WithDisc returns the coverage with one more live disc materialized — an
// echo front, or an additional swept path cell. The schedule is the one
// cached on the receiver at construction (Decision 3's "resolved once,
// threaded down" discipline extends to the receiver, not just a parameter).
func (c Coverage) WithDisc(center board.Cell, radius int) Coverage {
	c.discs = append(c.discs, coverageDisc{center: board.Canon(center, c.sched), cells: board.Within(center, radius, c.sched)})
	return c
}

// Covers reports whether a cell sits inside the live sensor union: within some
// disc's materialized cell set AND on a clear line of sight from its centre.
func (c Coverage) Covers(cell board.Cell) bool {
	for _, d := range c.discs {
		if d.cells[cell] && board.LineOfSight(d.center, cell, c.occluders, c.sched) {
			return true
		}
	}
	return false
}

// Empty reports whether the corp has no coverage in the system.
func (c Coverage) Empty() bool { return len(c.discs) == 0 }

// DiscsMaterialized reports how many bounded-radius cell sets this coverage
// built — the deterministic, build-target-independent measure of "bounded
// work" (tasks.md 4.7 / observation-fog-and-scan's "Ambient reveal work is
// bounded for a burn resolution"): at most one per distinct disc-worthy
// centre (a unit, an echo front, or a distinct swept path cell), never one
// per feature checked against it.
func (c Coverage) DiscsMaterialized() int { return len(c.discs) }

// Coverage computes the corp's live sensor union in a system from its units'
// current positions, shadowed by the system's large bodies at `now`. Passive
// sensors ride any moving unit — drifting or burning (Travis, 2026-07-10) —
// so every own fleet in the system contributes a bubble; a fleet with a
// RUNNING scan additionally contributes its echo disc: everything within the
// returned-echo front of the emission cell pinned at commit is live until
// resolution mints the durable memory at eta (#0006 Decision #26 — the pulse
// stays where it was fired; the ship moves on and still collects the
// returns).
func (s *Service) Coverage(ctx context.Context, cid, systemID string, now common.WorldMillis) (Coverage, error) {
	sched := board.ProductionSchedule()
	fleets, err := s.fleets.FleetsForCorp(ctx, cid, now)
	if err != nil {
		return Coverage{}, err
	}
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return Coverage{}, err
	}
	cov := Coverage{sched: sched, occluders: occluders(feats, now, sched)}
	for _, f := range fleets {
		if f.SystemId != systemID {
			continue
		}
		cov = cov.WithDisc(f.Cell, s.sensor.AmbientRadius)
		if center, radius, ok := s.echoDisc(ctx, f, systemID, now, sched); ok {
			cov = cov.WithDisc(center, radius)
		}
	}
	return cov, nil
}

// echoDisc computes a fleet's running-scan echo disc at `now`, if it has one:
// centred on the EMISSION CELL pinned in the action's params at commit — the
// pulse grows from where it was fired and stays there (#0006 Decision #26;
// supersedes the live-centred antenna of #22) — radius = how far the front
// has travelled (BoardRadius × elapsed/duration — ScanDuration IS the rim
// round-trip). A scan committed before the origin was pinned, or whose
// recorded origin fails to decode, falls back to the unit's live cell.
// Nothing to add for a fleet not scanning, a scan already past its eta
// (resolution owns it now), or when no action source is wired. This is a
// live coverage READ (not a resolution), so it does not log a fallback cause
// — that would fire on every fog read of a legacy scan; ScanResolver is
// where the cause is recorded, once, at resolve.
func (s *Service) echoDisc(ctx context.Context, f FleetPos, systemID string, now common.WorldMillis, sched polar.Schedule) (board.Cell, int, bool) {
	if f.ActiveScanId == "" || s.actions == nil {
		return board.Cell{}, 0, false
	}
	a, err := s.actions.Get(ctx, f.ActiveScanId)
	if err != nil || a == nil {
		return board.Cell{}, 0, false
	}
	if a.Type != scanType || a.Status != action.StatusRunning || a.Scope != systemID {
		return board.Cell{}, 0, false
	}
	duration := a.Eta - a.CommittedAt
	if duration <= 0 || now < a.CommittedAt {
		return board.Cell{}, 0, false
	}
	elapsed := now - a.CommittedAt
	if elapsed > duration {
		elapsed = duration
	}
	front := int(int64(common.Tuning().BoardRadius) * int64(elapsed) / int64(duration))
	center := f.Cell
	if origin, _, ok := paramCell(a.Params, "origin", sched); ok {
		center = origin
	}
	return center, front, true
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
	return cov.Covers(f.Cell), nil
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
// the EMISSION CELL pinned in params at commit (#0006 Decision #26 — the
// pulse stays where it was fired; echoDisc grows the live front from the
// same cell, so the mint is exactly what the front swept): a scan committed
// before the origin was pinned, or whose recorded origin fails to decode
// (undecodable shape, or a ring beyond the live schedule's maximum — the
// stored-coordinate guard, design.md Decision 3), falls back to the fleet's
// position at eta and records which of the three causes forced the
// fallback — origin-absent, undecodable-shape, ring-out-of-range (the one
// shared vocabulary fleet-movement's coordinate guard also uses) — in both
// the outcome text and a structured log entry. If the fleet has left the
// origin system by eta, the scan fizzles: done, an interrupted outcome,
// nothing minted (0006/S9). The writes are idempotent (keyed per
// feature/lane, monotonic tiers), so action applies them with MergeAll in
// the resolve transaction.
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
		// The fizzle test gates materialization (adversary R2-m1): a scan that
		// found nothing must not grow the world. Past it, the scanned system's
		// full lane horizon is materialized from the deterministic field BEFORE
		// charting, so the lanes charted below are the system's TRUE incident
		// lanes and a frontier scan never reports a false dead end.
		if err := s.lanes.EnsureLaneHorizon(ctx, originSys); err != nil {
			return action.ResolveResult{}, fmt.Errorf("materializing the scanned system's lane horizon: %w", err)
		}
		feats, err := s.interiors.Features(ctx, originSys)
		if err != nil {
			return action.ResolveResult{}, err
		}
		sched := board.ProductionSchedule()
		origin, cause, onBoard := paramCell(r.Action.Params, "origin", sched)
		fallbackCause := ""
		if !onBoard {
			logCoordinateRejection(ctx, cause, origin.Ring, scanType, r.Action.Id)
			fallbackCause = cause
			origin, onBoard = scanOrigin(actor.State, feats, r.At, sched)
		}
		if !onBoard {
			return fizzle("the fleet had no board position at the scan's eta"), nil
		}
		reveal, err := s.buildScan(ctx, actor.CorporationId, originSys, feats, origin, r.At, sched)
		if err != nil {
			return action.ResolveResult{}, err
		}
		outcome := fmt.Sprintf("scanned %s: %d features, %d lanes charted",
			originSys, len(reveal.features), len(reveal.lanes))
		if fallbackCause != "" {
			outcome += fmt.Sprintf(" (origin %s — fell back to the fleet's live position)", fallbackCause)
		}
		return action.ResolveResult{
			Outcome: outcome,
			Writes:  s.revealWrites(actor.CorporationId, originSys, reveal),
		}, nil
	}
}

// MintScan writes a scan's observations directly through the DAO — the non-
// action path (used by tests and any future non-resolve caller). The production
// scan mints through the resolver's Writes; both derive the SAME records from
// buildScan.
func (s *Service) MintScan(ctx context.Context, cid, systemID string, origin board.Cell, at common.WorldMillis) error {
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return err
	}
	reveal, err := s.buildScan(ctx, cid, systemID, feats, origin, at, board.ProductionSchedule())
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
func (s *Service) buildScan(ctx context.Context, cid, systemID string, feats []FeatureGeom, origin board.Cell, at common.WorldMillis, sched polar.Schedule) (scanReveal, error) {
	var out scanReveal

	occ := occluders(feats, at, sched)
	for _, f := range feats {
		h, ok := featureCellAt(f, at, sched)
		if !ok {
			continue
		}
		if !board.LineOfSight(origin, h, occ, sched) {
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
// swept sensor bubble — with line of sight from some swept cell (#0006 Decision
// #16) — mint a presence-only memory (geometry + asOf, NO composition — ambient
// records that a body is there and where, never its worth; scan is the only
// minter of that). Keyed per feature, so repeat passes are idempotent
// overwrites, and MergeAll preserves any scanned Detail already stored.
// Returned as action.DocWrites so the burn resolver applies them in its resolve
// transaction. Passive sensors ride any moving unit — drifting or burning.
//
// The sweep materializes at most one bounded-radius disc per DISTINCT path
// cell (NewSweptCoverage, design.md Decision 6) rather than one per-query
// board.Distance BFS per (path cell, feature) pair — bounded, deterministic
// work regardless of feature count.
func (s *Service) AmbientWrites(ctx context.Context, cid, systemID string, path []board.Cell, at common.WorldMillis) ([]action.DocWrite, error) {
	if len(path) == 0 || cid == "" {
		return nil, nil
	}
	sched := board.ProductionSchedule()
	feats, err := s.interiors.Features(ctx, systemID)
	if err != nil {
		return nil, err
	}
	occ := occluders(feats, at, sched)
	sweep := NewSweptCoverage(path, s.sensor.AmbientRadius, occ, sched)
	var writes []action.DocWrite
	for _, f := range feats {
		h, ok := featureCellAt(f, at, sched)
		if !ok || !sweep.Covers(h) {
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

// scanOrigin is the LEGACY beam origin — the fleet's board cell at the scan's
// eta, answered from the effective state (board.StateAt) — kept only as the
// fallback for scans committed before the emission cell was pinned in params
// (#0006 Decision #26), or whose recorded origin failed to decode. A fleet
// docked to an orbiting body scans from wherever that body IS at eta; a
// fleet out on a lane (or holding mid-lane) has no board position — the scan
// fizzles.
func scanOrigin(state board.MovementState, feats []FeatureGeom, at common.WorldMillis, sched polar.Schedule) (board.Cell, bool) {
	eff := board.StateAt(state, at, sched)
	switch eff.Mode {
	case board.ModeDocked:
		if eff.Docked == nil {
			return board.Cell{}, false
		}
		for _, f := range feats {
			if f.Id == eff.Docked.ParentId {
				return featureCellAt(f, at, sched)
			}
		}
		return board.Cell{}, false
	case board.ModeLaneHold:
		return board.Cell{}, false
	case board.ModeLaneTransit:
		if eff.LaneTransit == nil || eff.LaneTransit.BoardLeg == nil || at >= eff.LaneTransit.BoardLeg.GateEta {
			return board.Cell{}, false
		}
		return board.ShipPos(eff, at, sched)
	default:
		return board.ShipPos(eff, at, sched)
	}
}

// occluders is the large-body shadow set at a world time (#0006 Decision
// #16): every feature with a non-zero OcclusionRadius2 (design.md Decision
// 1 — which feature types qualify, and their radius, is the system domain's
// rule; observation stays purely geometric) at its computed position. A
// feature whose computed cell cannot be resolved (an orbit ring beyond the
// live schedule's maximum — the stored-coordinate guard) is silently
// omitted rather than reaching board.Canon and panicking.
func occluders(feats []FeatureGeom, at common.WorldMillis, sched polar.Schedule) []board.Occluder {
	var occ []board.Occluder
	for _, f := range feats {
		if f.OcclusionRadius2 == 0 {
			continue
		}
		cell, ok := featureCellAt(f, at, sched)
		if !ok {
			continue
		}
		occ = append(occ, board.Occluder{Cell: cell, Radius2: f.OcclusionRadius2})
	}
	return occ
}

// featureCellAt is a feature's cell at a world time (orbital position or
// anchor). ok is false when the feature's ring (orbiting or anchored) is
// beyond the live schedule's maximum — the stored-coordinate guard
// (design.md Decision 3's risk: a tuning.go radius reduction must degrade a
// read, never panic it) — so callers must skip rather than pass the
// feature into board.Canon/LineOfSight/OrbState.
func featureCellAt(f FeatureGeom, at common.WorldMillis, sched polar.Schedule) (board.Cell, bool) {
	if f.Elements != nil {
		if f.Elements.Ring < 0 || f.Elements.Ring > sched.MaxRing {
			return board.Cell{}, false
		}
		return board.OrbState(*f.Elements, at, sched), true
	}
	if f.Anchor.Ring < 0 || f.Anchor.Ring > sched.MaxRing {
		return board.Cell{}, false
	}
	return f.Anchor, true
}

// paramString reads a frozen string param.
func paramString(params map[string]interface{}, key string) string {
	s, _ := params[key].(string)
	return s
}

// paramCell decodes a frozen coordinate param through board.DecodeCell,
// reporting which of the three shared causes (fleet-movement's "Board
// Coordinates Outside the Live Schedule Are Rejected, Never Panicked" uses
// the SAME vocabulary) blocked the decode: origin-absent (no such param
// recorded at all — a legacy scan), undecodable-shape (present but not a
// decodable cell shape), or ring-out-of-range (a decodable cell whose ring
// exceeds the live schedule's maximum). On ring-out-of-range the returned
// cell still carries the offending ring, for the caller's log/outcome text.
func paramCell(params map[string]interface{}, key string, sched polar.Schedule) (cell board.Cell, cause string, ok bool) {
	raw, present := params[key]
	if !present {
		return board.Cell{}, "origin-absent", false
	}
	c, decoded := board.DecodeCell(raw)
	if !decoded {
		return board.Cell{}, "undecodable-shape", false
	}
	if c.Ring < 0 || c.Ring > sched.MaxRing {
		return c, "ring-out-of-range", false
	}
	return c, "", true
}

// logCoordinateRejection records a rejected/fallen-back-from coordinate param
// with the shared structured-log vocabulary (design.md; tasks.md 3.11/4.5):
// `cause` always, `ring` only for ring-out-of-range, and `actionType`/the
// action id because this is always an action-parameter decode here (the scan
// origin) — unlike fleet-movement's fleet-read guard, which has neither.
func logCoordinateRejection(ctx context.Context, cause string, ring int, actionType, actionId string) {
	evt := log.Warn().Ctx(ctx).Str("cause", cause)
	if cause == "ring-out-of-range" {
		evt = evt.Int("ring", ring)
	}
	evt.Str("actionType", actionType).Str("actionId", actionId).
		Msg("scan origin param rejected; falling back to the fleet's live position at eta")
}
