package system

import (
	"context"
	"errors"
	"fmt"

	"hexaverse/common"
	"hexaverse/galaxy"

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

type Service struct {
	dao       Dao
	galaxySvc galaxy.ServiceInterface
	clock     common.WorldTime
	params    GenerationParams
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
	return &gen, nil
}

// readInterior returns the stored interior (+ features), or nil if not yet
// materialized.
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
	return &GeneratedInterior{Interior: *si, Features: features}, nil
}
