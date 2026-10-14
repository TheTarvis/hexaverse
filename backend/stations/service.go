package stations

import (
	"context"
	"errors"

	"hexaverse/charts"
	"hexaverse/common"
	"hexaverse/discovery"
	"hexaverse/galaxy"
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
	SystemTiers(ctx context.Context, cid string) (map[string]charts.Tier, error)
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
	discovery interface {
		Record(context.Context, string, string, string) (*discovery.Record, error)
	}
	dao   Dao
	graph GraphSource
	tiers TierSource
	clock common.WorldTime
	// minTier is market.Params.MinVisibilityTier, INJECTED rather than imported:
	// market imports this package (a sale decrements a station's requests), so
	// importing market here would cycle. router.go is where the two meet.
	minTier charts.Tier
}

func NewService(graph GraphSource, tiers TierSource) *Service {
	return &Service{
		dao:     NewDao(),
		graph:   graph,
		tiers:   tiers,
		clock:   common.WorldClock(),
		minTier: charts.TierRumored,
	}
}

func NewServiceWith(dao Dao, graph GraphSource, tiers TierSource, clock common.WorldTime) *Service {
	return &Service{
		dao: dao, graph: graph, tiers: tiers, clock: clock,
		minTier: charts.TierRumored,
	}
}

// WithMinVisibilityTier sets the graph tier a requester must reach before a
// station discloses to them (market.Params.MinVisibilityTier).
func (s *Service) WithMinVisibilityTier(t charts.Tier) *Service {
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
		Str("featureId", st.FeatureId).
		Msg("Provisioned NPC trading station")
	return nil
}

func (s *Service) Get(ctx context.Context, systemID string) (*Station, error) {
	meta, err := s.graph.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	station, err := s.dao.Get(ctx, meta.Id, systemID)
	if err != nil || station == nil {
		return station, err
	}
	if s.discovery != nil {
		record, err := s.discovery.Record(ctx, meta.Id, systemID, StationFeatureId)
		if err != nil {
			return nil, err
		}
		if record != nil {
			station.Name = record.Name
			station.OwnerCorpId = record.OwnerCorpId
		}
	}
	return station, nil
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
	return FeatureOf(st), nil
}

// FeatureOf shapes a station as an interior feature: id, type, name and owner,
// and nothing else. It carries NO position — the station's orbital element set
// is derived at interior-splice time (system.StationContinuousOrbit) from the
// galaxy seed, the system id and the system's own skeleton, so it is never
// stored on the station document and never reconstructed here.
//
// This function cannot fail. The out-of-range guard it used to carry —
// rejecting a stored orbit ring beyond the live board schedule, so a radius
// retune degraded the read rather than panicking it — has no subject left: a
// station carries no ring, and there is no schedule to exceed.
func FeatureOf(st *Station) *system.Feature {
	return &system.Feature{
		Id:          st.FeatureId,
		Type:        system.FeatureStation,
		Name:        stationName(st),
		OwnerCorpId: st.OwnerCorpId,
	}
}

func stationName(st *Station) string {
	if st.Name != "" {
		return st.Name
	}
	return "Trading Station"
}
func (s *Service) WithDiscovery(d interface {
	Record(context.Context, string, string, string) (*discovery.Record, error)
}) *Service {
	s.discovery = d
	return s
}
