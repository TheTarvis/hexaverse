package galaxy

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// ErrNoLiveGalaxy means no galaxy has been generated/seeded for this
// environment yet.
var ErrNoLiveGalaxy = errors.New("no live galaxy")

type ServiceInterface interface {
	// Generate builds a fresh galaxy from (seed, params), persists it under a
	// new id, and points "live" at it. Re-runnable — never corrupts the prior
	// galaxy (it stays at its old id; only the pointer moves).
	Generate(ctx context.Context, seed int64, params GenerationParams) (*GeneratedGalaxy, error)
	// GetLive returns the current live galaxy (metadata + systems + lanes).
	GetLive(ctx context.Context) (*GeneratedGalaxy, error)
	// GetLiveSystem returns a single system node from the live galaxy — the
	// lightweight graph-tier record (coords, region, name, skeleton). Used
	// service-to-service by the system domain for the character dial + skeleton.
	GetLiveSystem(ctx context.Context, systemID string) (*System, error)
	// LiveGalaxyMeta returns the current live galaxy's metadata doc (id, seed,
	// params, bounds) — one cheap read. The system domain needs the id (to nest
	// per-system state under galaxies/{id}/...) and the seed (to derive the same
	// per-system seed M1's skeleton used).
	LiveGalaxyMeta(ctx context.Context) (*Galaxy, error)
}

type Service struct {
	dao   Dao
	clock common.WorldTime
}

func NewService() *Service {
	return &Service{dao: NewDao(), clock: common.WorldClock()}
}

func NewServiceWith(dao Dao, clock common.WorldTime) *Service {
	return &Service{dao: dao, clock: clock}
}

func (s *Service) Generate(ctx context.Context, seed int64, params GenerationParams) (*GeneratedGalaxy, error) {
	gen := Generate(seed, params)
	gen.Galaxy.Id = fmt.Sprintf("gal_%s", uuid.NewString())
	gen.Galaxy.CreatedAt = s.clock.Now()

	if err := s.dao.SaveGalaxy(ctx, gen); err != nil {
		return nil, fmt.Errorf("persisting galaxy: %w", err)
	}
	if err := s.dao.SetLivePointer(ctx, gen.Galaxy.Id); err != nil {
		return nil, fmt.Errorf("setting live pointer: %w", err)
	}

	log.Info().Ctx(ctx).
		Str("galaxyId", gen.Galaxy.Id).
		Int64("seed", seed).
		Int("systems", len(gen.Systems)).
		Msg("Generated and set live galaxy")
	return &gen, nil
}

func (s *Service) GetLive(ctx context.Context) (*GeneratedGalaxy, error) {
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}

	meta, err := s.dao.GetGalaxyMeta(ctx, id)
	if err != nil {
		return nil, err
	}
	if meta == nil {
		return nil, ErrNoLiveGalaxy
	}

	systems, err := s.dao.ListSystems(ctx, id)
	if err != nil {
		return nil, err
	}
	lanes, err := s.dao.ListLanes(ctx, id)
	if err != nil {
		return nil, err
	}

	return &GeneratedGalaxy{Galaxy: *meta, Systems: systems, Lanes: lanes}, nil
}

// ErrSystemNotFound means the requested system id isn't in the live galaxy.
var ErrSystemNotFound = errors.New("system not found")

func (s *Service) LiveGalaxyMeta(ctx context.Context) (*Galaxy, error) {
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}
	meta, err := s.dao.GetGalaxyMeta(ctx, id)
	if err != nil {
		return nil, err
	}
	if meta == nil {
		return nil, ErrNoLiveGalaxy
	}
	return meta, nil
}

func (s *Service) GetLiveSystem(ctx context.Context, systemID string) (*System, error) {
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}
	sys, err := s.dao.GetSystem(ctx, id, systemID)
	if err != nil {
		return nil, err
	}
	if sys == nil {
		return nil, ErrSystemNotFound
	}
	return sys, nil
}
