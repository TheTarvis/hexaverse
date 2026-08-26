package system

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/galaxy"
	"hexaverse/polar"

	"github.com/rs/zerolog/log"
)

// ErrNotFound means the system id isn't in the live galaxy (so it has no
// interior to generate).
var ErrNotFound = errors.New("system not found")

type ServiceInterface interface {
	// GetOrCreateInterior returns the system's interior, materializing it on
	// first request (the dev-only trigger until #0008's arrival dispatch
	// replaces it). Shared world state, generated once, idempotent under races.
	GetOrCreateInterior(ctx context.Context, systemID string) (*GeneratedInterior, error)
	// LaneGates returns the system's charted lane gates — the rim tiles where
	// its lanes depart toward their neighbours, projected onto a board of the
	// given radius (#0008 Decision #10). Unfogged; the read boundary filters.
	LaneGates(ctx context.Context, systemID string, radius int) ([]LaneGate, error)
}

// StationSource supplies a system's trading station as a board feature (#0011).
// Consumer-declared here so `system` never imports the station package — the
// station package imports THIS one (for Orbit, the feature shape, and the
// dominant-direction law), and a cycle would be the alternative.
type StationSource interface {
	StationFeature(ctx context.Context, systemID string) (*Feature, error)
}

type Service struct {
	dao       Dao
	galaxySvc galaxy.ServiceInterface
	clock     common.WorldTime
	params    GenerationParams
	// stations splices the system's station into every interior read. Nil ⇒ no
	// station is ever spliced, which is exactly the pre-#0011 behaviour.
	stations StationSource
}

// WithStations wires the station splice. Post-construction, like fleet's
// WithTravel, because the station service depends on services constructed
// alongside this one.
func (s *Service) WithStations(src StationSource) *Service {
	s.stations = src
	return s
}

func NewService() *Service {
	return &Service{
		dao:       NewDao(),
		galaxySvc: galaxy.NewService(),
		clock:     common.WorldClock(),
		params:    DefaultParams(),
	}
}

func NewServiceWith(dao Dao, galaxySvc galaxy.ServiceInterface, clock common.WorldTime) *Service {
	return &Service{dao: dao, galaxySvc: galaxySvc, clock: clock, params: DefaultParams()}
}

func (s *Service) GetOrCreateInterior(ctx context.Context, systemID string) (*GeneratedInterior, error) {
	meta, err := s.galaxySvc.LiveGalaxyMeta(ctx)
	if err != nil {
		return nil, err
	}
	galaxyID := meta.Id

	// Fast path: already materialized.
	if gen, err := s.readInterior(ctx, galaxyID, systemID); err != nil {
		return nil, err
	} else if gen != nil {
		s.spliceStation(ctx, gen)
		return gen, nil
	}

	// Look up the graph-tier node for the character dial + skeleton.
	node, err := s.galaxySvc.GetLiveSystem(ctx, systemID)
	if err != nil {
		if errors.Is(err, galaxy.ErrSystemNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	// Generate deterministically from the SAME per-system seed M1's skeleton
	// used, so the interior extends the skeleton rather than contradicting it.
	seed := galaxy.SystemSeed(meta.Seed, systemID)
	gen := Generate(seed, string(node.Region), node.Skeleton, s.params)
	gen.Interior.SystemId = systemID
	gen.Interior.CreatedAt = s.clock.Now()

	// TODO(#0008): arrival via a lane is the real "Explored" trigger; until then
	// the read endpoint materializes on first request. Create-if-absent makes a
	// concurrent double-explore resolve to one interior (see dao.CreateInterior).
	if err := s.dao.CreateInterior(ctx, galaxyID, gen); err != nil {
		if errors.Is(err, ErrAlreadyExists) {
			// Lost the race — read the winner's copy (identical by determinism).
			winner, rerr := s.readInterior(ctx, galaxyID, systemID)
			if rerr != nil {
				return nil, rerr
			}
			if winner == nil {
				return nil, fmt.Errorf("interior claimed but not readable for %s", systemID)
			}
			return winner, nil
		}
		return nil, err
	}

	log.Info().Ctx(ctx).Str("systemId", systemID).Str("character", string(node.Region)).
		Int("features", len(gen.Features)).Msg("Generated system interior")
	s.spliceStation(ctx, &gen)
	return &gen, nil
}

// spliceStation appends the system's station to a projected interior, if one
// exists. Ungated by design: this seam has no requester to gate against (its
// callers include arrival settlement under the OIDC sweep, where there is no
// requester at all), so the visibility gate lives at the requester-scoped read
// surfaces instead.
//
// DEGRADES, never fails: a station-store read error omits only the station and
// leaves the rest of the interior intact. The interior read has no market
// dependency today and this splice must not introduce one.
func (s *Service) spliceStation(ctx context.Context, gen *GeneratedInterior) {
	if s.stations == nil || gen == nil {
		return
	}
	feat, err := s.stations.StationFeature(ctx, gen.Interior.SystemId)
	if err != nil {
		log.Warn().Ctx(ctx).Err(err).Str("systemId", gen.Interior.SystemId).
			Msg("Station store unavailable; serving interior without its station")
		return
	}
	if feat != nil {
		gen.Features = append(gen.Features, *feat)
	}
}

// readInterior returns the stored interior (+ features), or nil if not yet
// materialized.
//
// Every decoded feature is validated against the interior's OWN schedule
// (board.Schedule(si.Radius)) before it can reach any lattice computation
// (design.md Decision 3's risk: polar.Schedule.Slots panics above MaxRing,
// and board.Canon calls it — so a tuning.go radius reduction that leaves a
// stored feature's ring above the new live schedule would panic a read
// handler, not answer wrong). A feature that fails is OMITTED and logged
// with its id, the offending ring, and the system id — not just a log line,
// so a downstream ErrFeatureAbsent (e.g. fleet.Position → resolveFeature on
// a fleet docked to a now-guarded feature) is attributable to this guard
// rather than read as a genuinely missing feature. One bad feature never
// stops the loop over the rest (tasks.md 2.7).
func (s *Service) readInterior(ctx context.Context, galaxyID, systemID string) (*GeneratedInterior, error) {
	si, err := s.dao.GetInterior(ctx, galaxyID, systemID)
	if err != nil {
		return nil, err
	}
	if si == nil {
		return nil, nil
	}
	features, err := s.dao.ListFeatures(ctx, galaxyID, systemID)
	if err != nil {
		return nil, err
	}
	sched := board.Schedule(si.Radius)
	kept := make([]Feature, 0, len(features))
	for _, f := range features {
		if ring, ok := featureRingOK(f, sched); !ok {
			log.Warn().Ctx(ctx).Str("systemId", systemID).Str("featureId", f.Id).
				Int("ring", ring).Int("maxRing", sched.MaxRing).
				Msg("Decoded feature ring exceeds the live board schedule; omitting from the interior read")
			continue
		}
		kept = append(kept, f)
	}
	return &GeneratedInterior{Interior: *si, Features: kept}, nil
}

// featureRingOK reports whether every ring a feature carries (its orbit, if
// any, and every footprint cell) is within the schedule's live MaxRing. When
// it is not, it also returns the first offending ring found, for the guard's
// log line.
func featureRingOK(f Feature, sched polar.Schedule) (offendingRing int, ok bool) {
	if f.Orbit != nil && (f.Orbit.Ring < 0 || f.Orbit.Ring > sched.MaxRing) {
		return f.Orbit.Ring, false
	}
	for _, c := range f.Footprint {
		if c.Ring < 0 || c.Ring > sched.MaxRing {
			return c.Ring, false
		}
	}
	return 0, true
}
