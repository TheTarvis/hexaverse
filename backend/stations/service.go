package stations

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/observation"
	"hexaverse/system"

	"github.com/rs/zerolog/log"
)

// GraphSource is the galaxy dependency: the live galaxy's id (to nest the
// station under galaxies/{gid}/...) and its seed (to derive the placement).
type GraphSource interface {
	LiveGalaxyMeta(ctx context.Context) (*galaxy.Galaxy, error)
}

// TierSource answers "what does this corporation know about that system?" — the
// graph-tier fog read the station's visibility gate keys on. Sensor coverage is
// deliberately NOT consulted: a station is an artificial structure broadcasting
// its own existence, which is public information at the price board's tier, not
// a sensed-and-remembered fact.
type TierSource interface {
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
}

type ServiceInterface interface {
	// EnsureStation provisions the system's NPC station, idempotently per system
	// id. Two corporations spawning into the same home converge on ONE station.
	EnsureStation(ctx context.Context, systemID string) error
	// Get returns the system's station UNGATED — the structural read every
	// non-requester-scoped caller uses (dock resolution, position, the mine
	// rejection). nil, nil when the system has no station.
	Get(ctx context.Context, systemID string) (*Station, error)
	// GetVisible returns the station only if corpID's graph tier for that system
	// clears the configured minimum. Existence is hidden below the gate:
	// ErrNotFound, never a distinguishable "you can't see it".
	GetVisible(ctx context.Context, corpID, systemID string) (*Station, error)
}

type Service struct {
	dao   Dao
	graph GraphSource
	tiers TierSource
	clock common.WorldTime
	// gateRing NAME NOTE (tasks.md 2.8): despite the identifier, this field
	// holds the BOARD RADIUS DeriveOrbit places a station's orbit within, not
	// board.GateRing(boardRadius) itself — see
	// docs/defects/2026-08-26-station-on-gate-ring.md for the open gap between
	// the two. tasks.md 2.8 asks for this identifier to be renamed to
	// `boardRadius`; that rename is deliberately NOT done here because
	// service_test.go:90 (a pre-existing, untouched-by-this-migration test)
	// accesses this field directly by name (`svc.gateRing`), and test files may
	// not be edited to accommodate a production rename — reported to the
	// orchestrator as a task/test collision rather than silently either
	// breaking the test or silently skipping the task. Sourced from the shared
	// board geometry so it cannot drift from fleet's gates or the generated
	// interior radius.
	gateRing int
	// minTier is market.Params.MinVisibilityTier, INJECTED rather than imported:
	// market imports this package (a sale decrements a station's requests), so
	// importing market here would cycle. router.go is where the two meet.
	minTier observation.Tier
}

func NewService(graph GraphSource, tiers TierSource) *Service {
	return &Service{
		dao:      NewDao(),
		graph:    graph,
		tiers:    tiers,
		clock:    common.WorldClock(),
		gateRing: common.Tuning().BoardRadius,
		minTier:  observation.TierRumored,
	}
}

func NewServiceWith(dao Dao, graph GraphSource, tiers TierSource, clock common.WorldTime) *Service {
	return &Service{
		dao: dao, graph: graph, tiers: tiers, clock: clock,
		gateRing: common.Tuning().BoardRadius,
		minTier:  observation.TierRumored,
	}
}

// WithMinVisibilityTier sets the graph tier a requester must reach before a
// station discloses to them (market.Params.MinVisibilityTier).
func (s *Service) WithMinVisibilityTier(t observation.Tier) *Service {
	s.minTier = t
	return s
}

func (s *Service) EnsureStation(ctx context.Context, systemID string) error {
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return err
	}
	// Fast path: already provisioned. Cheap, and it keeps a healed spawn from
	// re-deriving on every pass.
	existing, err := s.dao.Get(ctx, meta.Id, systemID)
	if err != nil {
		return err
	}
	if existing != nil {
		return nil
	}

	st := Station{
		SystemId:  systemID,
		Orbit:     DeriveOrbit(meta.Seed, systemID, s.gateRing),
		FeatureId: StationFeatureId,
		CreatedAt: s.clock.Now(),
		// OwnerCorpId is deliberately left empty: this is the ONE
		// station-provisioning entry point in this version and it takes no owner
		// argument at all, so a station can only ever be NPC-owned here.
	}
	if err := s.dao.Create(ctx, meta.Id, st); err != nil {
		if errors.Is(err, ErrAlreadyExists) {
			// Lost the race to a concurrent spawn — the winner's station is
			// identical by determinism, so this IS success.
			return nil
		}
		return err
	}
	log.Info().Ctx(ctx).
		Str("systemId", systemID).
		Int("ring", st.Orbit.Ring).
		Int("dir", st.Orbit.Dir).
		Msg("Provisioned NPC trading station")
	return nil
}

func (s *Service) Get(ctx context.Context, systemID string) (*Station, error) {
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	return s.dao.Get(ctx, meta.Id, systemID)
}

func (s *Service) GetVisible(ctx context.Context, corpID, systemID string) (*Station, error) {
	visible, err := s.Visible(ctx, corpID, systemID)
	if err != nil {
		return nil, err
	}
	if !visible {
		// Existence hidden — the same fog convention foreign fleets and mine
		// targets already use. A caller must not be able to probe for which
		// systems carry stations by comparing responses.
		return nil, ErrNotFound
	}
	st, err := s.Get(ctx, systemID)
	if err != nil {
		return nil, err
	}
	if st == nil {
		return nil, ErrNotFound
	}
	return st, nil
}

// Visible reports whether corpID's graph tier for systemID clears the configured
// minimum. A corpless requester (empty corpID) is NOT gated — matching the
// existing interior-read convention, where the fog filters are bypassed entirely
// when there is no corp id to key them on.
func (s *Service) Visible(ctx context.Context, corpID, systemID string) (bool, error) {
	if corpID == "" || s.tiers == nil {
		return true, nil
	}
	tiers, err := s.tiers.SystemTiers(ctx, corpID)
	if err != nil {
		return false, err
	}
	return tiers[systemID].AtLeast(s.minTier), nil
}

// StationFeature returns the station shaped as a board feature, for splicing
// into a system's interior read. nil when the system carries no station.
//
// This implements system.StationSource. The splice at
// system.Service.GetOrCreateInterior is deliberately UNGATED — that function
// takes no requester and none of its callers carry one (arrival settlement runs
// under the OIDC sweep, where there is no requester at all), so a per-observer
// gate is simply not constructible at that seam. The gate lives at the
// requester-scoped read surfaces instead.
func (s *Service) StationFeature(ctx context.Context, systemID string) (*system.Feature, error) {
	st, err := s.Get(ctx, systemID)
	if err != nil || st == nil {
		return nil, err
	}
	// A FeatureOf omission (out-of-range orbit ring) degrades to no-station,
	// never a failed interior read (tasks.md 2.8b) — FeatureOf itself already
	// records the system id + offending ring, so nothing more to log here.
	feat, _ := FeatureOf(st)
	return feat, nil
}

// ErrStationRingOutOfRange means a stored station's orbit ring exceeds the
// live board schedule's maximum — a tuning.go radius reduction (or stale
// data) that must degrade the read, never reach board.Canon/sched.Slots and
// panic it (design.md Decision 3's risk; tasks.md 2.8b).
var ErrStationRingOutOfRange = errors.New("stations: station orbit ring exceeds the live board schedule")

// FeatureOf shapes a station as a board feature. It carries orbital elements
// like any orbiting feature, so fleet.Position's existing featureOrbit branch
// resolves a docked fleet's live position with no new code.
//
// It validates the stored orbit's ring against board.ProductionSchedule()
// BEFORE computing the footprint (stations holds no per-system interior, so
// per design.md Decision 3 it defaults to the process-wide production
// schedule) — this runs AHEAD of (and independently from) the interior's own
// feature-decode guard (system.readInterior's featureRingOK, tasks.md 2.7),
// because the splice at GetOrCreateInterior happens after that guard already
// ran on the generated/stored features; a station is not one of them. A
// rejection is logged HERE (with the station's system id and the offending
// ring) rather than by each caller, so every entry point — the Service, or a
// direct FeatureOf call from a test double — records the same way
// (trading-station's degrade-to-no-station rule).
func FeatureOf(st *Station) (*system.Feature, error) {
	sched := board.ProductionSchedule()
	if st.Orbit.Ring < 0 || st.Orbit.Ring > sched.MaxRing {
		log.Warn().Str("systemId", st.SystemId).Int("ring", st.Orbit.Ring).Int("maxRing", sched.MaxRing).
			Msg("Station orbit exceeds the live board schedule; omitting the station")
		return nil, fmt.Errorf("%w: ring %d exceeds max %d", ErrStationRingOutOfRange, st.Orbit.Ring, sched.MaxRing)
	}
	orbit := st.Orbit
	// Period is never persisted (it is derived from live tuning), so refill it —
	// a station read back from the store would otherwise orbit with period 0.
	orbit.Period = system.PeriodFor(orbit.Ring)
	cell := board.Canon(board.Cell{Ring: orbit.Ring, Slot: orbit.Angle0}, sched)
	return &system.Feature{
		Id:          st.FeatureId,
		Type:        system.FeatureStation,
		Name:        "Trading Station",
		Orbit:       &orbit,
		Footprint:   []board.Cell{cell},
		OwnerCorpId: st.OwnerCorpId,
	}, nil
}
