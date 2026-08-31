package observation

import (
	"context"

	"hexaverse/action"
	"hexaverse/common"
)

// Service is the fog-of-war domain's surviving half: the graph-tier ladder,
// the charted-lane set, and the arrival reveal writers (design.md Decision
// 11, migrate-fleet-to-continuous-burns). Its live half — the lattice-hop
// sensor coverage computed from own units' board cells, the running scan's
// echo disc, the scan verb's resolver/mint, the path-swept ambient reveal,
// and the audience-visibility union a foreign fleet was checked against —
// is deleted outright by tasks.md section 7 (tasks 7.1-7.5): a fleet no
// longer has a board cell to compute any of it from (Decision 4), and
// link 5 (replace-observation-with-sightings) is what replaces it, not this
// change.
type Service struct {
	dao    Dao
	clock  common.WorldTime
	sensor SensorParams
	scan   ScanParams
}

// NewService constructs the production Service.
func NewService() *Service {
	return &Service{
		dao:    NewDao(),
		clock:  common.WorldClock(),
		sensor: DefaultSensorParams(),
		scan:   DefaultScanParams(),
	}
}

// NewServiceWith constructs a Service from explicit dependencies, for tests.
//
// The three unnamed parameters between dao and clock previously carried the
// three dependency-inversion seams the deleted ambient-coverage/echo-front/
// scan-mint machinery read live unit positions and interior geometry
// through (tasks.md 7.1-7.5). None of this package's four surviving
// requirements (the graph-tier ladder, the charted-lane set, and the two
// arrival reveals) reads any of them, so the positions carry nothing today.
// They stay as unused parameters — rather than being deleted and forcing
// every existing caller to reshape around a constructor with nothing left
// to inject — mirroring the same "retained, unwritten" posture design.md
// Decision 11 already applies to SensorParams/ScanParams pending link 5's
// focused scan.
func NewServiceWith(dao Dao, _, _, _ any, clock common.WorldTime) *Service {
	return &Service{
		dao:    dao,
		clock:  clock,
		sensor: DefaultSensorParams(),
		scan:   DefaultScanParams(),
	}
}

// WithParams overrides the tuning (tests pin deterministic beam geometry).
func (s *Service) WithParams(sensor SensorParams, scan ScanParams) *Service {
	s.sensor = sensor
	s.scan = scan
	return s
}

// ScanParams exposes the commit-time tuning a future scan verb would need to
// set its ETA. Retained, unwritten — tasks.md 7.3 deletes this package's own
// scan-resolve-and-mint path entirely (design.md Decision 11, Open Question
// 4: link 5's focused scan is the eventual consumer).
func (s *Service) ScanParams() ScanParams { return s.scan }

// --- surviving graph-tier / lane-chart reads --------------------------------

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
// Decision #17). Survives tasks.md 7.1-7.5 unchanged: it reads the corp's own
// charted-lane records, never the lattice-hop coverage those tasks delete.
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

// --- reveal writes ----------------------------------------------------------
//
// A per-feature board-tier memory reader (RememberedFeatures) used to live
// here, backing the three-band fog projection system's interior read ran
// until migrate-fleet-to-continuous-burns tasks.md 7.7 replaced it with the
// unfogged interim read (design.md Decision 11). Deleted here as a
// resolved ambiguity (tasks.md 7's own ambiguity note 1): once 7.7 landed,
// nothing in this codebase called it — the requirement it served
// ("Three-Band Fog Projection of Features") is itself REMOVED by this
// change, and it backed no other requirement of its own.
//
// Its return shape (`FeatureMemory`, plus the `Band`/`BandVisible`/
// `BandRemembered` visibility enum it paired with) is deleted too, as of
// this pass: with `RememberedFeatures` itself gone, no surviving requirement
// constructs or reads either — see model.go's dependency-inversion-inputs
// section comment. `FeatureObservation` (the stored atom
// `ListFeatureObservations`/`UpsertFeatureObservation` still read and write,
// and `observation/dao_test.go` still exercises directly) is kept: it is
// the persisted record, not the deleted per-requester projection shape built
// from it.

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
