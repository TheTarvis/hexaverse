package corporations

import (
	"context"
	"errors"
	"strings"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/observation"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var (
	ErrNotFound       = errors.New("corporation not found")
	ErrForbidden      = errors.New("forbidden")
	ErrNameRequired   = errors.New("corporation name is required")
	ErrHasLivingFleet = errors.New("corporation still has a living fleet")
)

// GraphSource is the galaxy dependency: the live graph (site selection + onward
// lanes) and a single system read (the home DTO the wake returns).
type GraphSource interface {
	GetLive(ctx context.Context) (*galaxy.GeneratedGalaxy, error)
	GetLiveSystem(ctx context.Context, systemID string) (*galaxy.System, error)
}

// FleetSource places the starting hull and answers the death invariant's
// fleet-count question. Cross-domain through the service, never the DAO.
type FleetSource interface {
	SeedFleet(ctx context.Context, systemID, corporationID string, at board.Hex) (*fleet.Fleet, error)
	ListForCorp(ctx context.Context, corporationID string) ([]fleet.Fleet, error)
}

// FogSource writes the initial observations and reads other corps' explored sets
// for the unclaimed-distance test.
type FogSource interface {
	RevealArrival(ctx context.Context, cid, destSystemID string, onward []string, at common.WorldMillis) error
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
}

type ServiceInterface interface {
	// Spawn wakes the account's mind: creates (or returns, idempotently) its living
	// corporation, its one hull in a frontier system, and the home fog. Name is the
	// only caller input.
	Spawn(ctx context.Context, accountId, name string) (*SpawnResult, error)
	// GetForAccount returns the account's living corporation (ErrNotFound if the
	// account hasn't woken yet) — the client's session bootstrap (GET /me).
	GetForAccount(ctx context.Context, accountId string) (*Corporation, error)
	// CorpForAccount is the ActorCorp seam: account → living corp id ("" if none).
	CorpForAccount(ctx context.Context, accountId string) (string, error)
	// MarkDead stamps diedAt — permitted ONLY when the corp has zero fleets (the
	// death invariant). No slice path reaches it; it ships so combat inherits it.
	MarkDead(ctx context.Context, corpID string) error
}

type Service struct {
	dao    Dao
	graph  GraphSource
	fleets FleetSource
	fog    FogSource
	clock  common.WorldTime
	params SpawnParams
}

// NewService wires the corporation domain. The galaxy/fleet/fog services are the
// SAME instances router.go already constructed (fog + fleet share the action
// spine), so spawn orchestrates through live singletons, not fresh copies.
func NewService(graph GraphSource, fleets FleetSource, fog FogSource) *Service {
	return &Service{
		dao:    NewDao(),
		graph:  graph,
		fleets: fleets,
		fog:    fog,
		clock:  common.WorldClock(),
		params: DefaultSpawnParams(),
	}
}

func NewServiceWith(dao Dao, graph GraphSource, fleets FleetSource, fog FogSource, clock common.WorldTime) *Service {
	return &Service{
		dao:    dao,
		graph:  graph,
		fleets: fleets,
		fog:    fog,
		clock:  clock,
		params: DefaultSpawnParams(),
	}
}

func (s *Service) Spawn(ctx context.Context, accountId, name string) (*SpawnResult, error) {
	if accountId == "" {
		return nil, ErrForbidden
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, ErrNameRequired
	}

	// Idempotent per account: an existing living corp returns as-is, its assets
	// ensured (heals a spawn that died between the corp commit and the fleet/fog).
	if corpID, err := s.dao.CorpIdForAccount(ctx, accountId); err != nil {
		return nil, err
	} else if corpID != "" {
		if corp, err := s.dao.Get(ctx, corpID); err != nil {
			return nil, err
		} else if corp != nil {
			return s.ensureSpawnAssets(ctx, corp)
		}
		// Dangling pointer (corp doc gone) — fall through and mint a fresh one.
	}

	// Fresh wake. The corp doc + account pointer commit in ONE transaction (the
	// spawn anchor); the hull + fog follow through their services, healed on retry
	// by the idempotent path above.
	corp := Corporation{
		Id:        "corp_" + uuid.NewString(),
		AccountId: accountId,
		Name:      name,
		CreatedAt: s.clock.Now(),
	}
	if err := s.dao.CreateWithPointer(ctx, corp); err != nil {
		if errors.Is(err, ErrAccountHasCorp) {
			// Concurrent spawn won the pointer — return the winner's corp.
			corpID, e := s.dao.CorpIdForAccount(ctx, accountId)
			if e != nil {
				return nil, e
			}
			existing, e := s.dao.Get(ctx, corpID)
			if e != nil {
				return nil, e
			}
			if existing == nil {
				return nil, ErrNotFound
			}
			return s.ensureSpawnAssets(ctx, existing)
		}
		return nil, err
	}
	log.Info().Ctx(ctx).Str("corpId", corp.Id).Str("accountId", accountId).Msg("Corporation woke")
	return s.ensureSpawnAssets(ctx, &corp)
}

// ensureSpawnAssets makes the corp's derived assets exist (idempotently): its one
// hull in a chosen home system, and the initial fog (home Explored + onward lanes
// Rumored). Safe to re-run — an existing hull is reused, the fog upserts are
// monotonic — which is what makes spawn idempotent per account.
func (s *Service) ensureSpawnAssets(ctx context.Context, corp *Corporation) (*SpawnResult, error) {
	now := s.clock.Now()
	gal, err := s.graph.GetLive(ctx)
	if err != nil {
		return nil, err
	}

	fleets, err := s.fleets.ListForCorp(ctx, corp.Id)
	if err != nil {
		return nil, err
	}

	var hull *fleet.Fleet
	var home string
	if len(fleets) > 0 {
		hull = &fleets[0]
		home = hull.SystemId
	} else {
		claimed, err := s.claimedSpace(ctx, corp.Id)
		if err != nil {
			return nil, err
		}
		site, err := selectSpawnSite(gal, claimed, s.params, corp.AccountId)
		if err != nil {
			return nil, err
		}
		home = site.Id
		hull, err = s.fleets.SeedFleet(ctx, home, corp.Id, s.rimHex(corp.AccountId))
		if err != nil {
			return nil, err
		}
	}

	if err := s.fog.RevealArrival(ctx, corp.Id, home, neighborsOf(gal, home), now); err != nil {
		return nil, err
	}

	homeSys, err := s.graph.GetLiveSystem(ctx, home)
	if err != nil {
		return nil, err
	}
	return &SpawnResult{Corporation: *corp, Fleet: hull, HomeSystem: homeSys, WorldTime: now}, nil
}

func (s *Service) GetForAccount(ctx context.Context, accountId string) (*Corporation, error) {
	corpID, err := s.dao.CorpIdForAccount(ctx, accountId)
	if err != nil {
		return nil, err
	}
	if corpID == "" {
		return nil, ErrNotFound
	}
	corp, err := s.dao.Get(ctx, corpID)
	if err != nil {
		return nil, err
	}
	if corp == nil {
		return nil, ErrNotFound
	}
	return corp, nil
}

func (s *Service) CorpForAccount(ctx context.Context, accountId string) (string, error) {
	return s.dao.CorpIdForAccount(ctx, accountId)
}

func (s *Service) MarkDead(ctx context.Context, corpID string) error {
	corp, err := s.dao.Get(ctx, corpID)
	if err != nil {
		return err
	}
	if corp == nil {
		return ErrNotFound
	}
	fleets, err := s.fleets.ListForCorp(ctx, corpID)
	if err != nil {
		return err
	}
	if len(fleets) > 0 {
		return ErrHasLivingFleet
	}
	return s.dao.SetDiedAt(ctx, corpID, s.clock.Now())
}

// claimedSpace is the union of every OTHER living corp's explored systems — the
// "known space" the unclaimed-distance test measures against. Excludes exceptCorp
// (the one being spawned) so a heal-time re-pick doesn't fence itself out.
func (s *Service) claimedSpace(ctx context.Context, exceptCorpID string) (map[string]bool, error) {
	living, err := s.dao.ListLiving(ctx)
	if err != nil {
		return nil, err
	}
	claimed := make(map[string]bool)
	for i := range living {
		c := &living[i]
		if c.Id == exceptCorpID {
			continue
		}
		tiers, err := s.fog.SystemTiers(ctx, c.Id)
		if err != nil {
			return nil, err
		}
		for sysID, tier := range tiers {
			if tier.AtLeast(observation.TierExplored) {
				claimed[sysID] = true
			}
		}
	}
	return claimed, nil
}

// rimHex is the starting hull's coast position: a deterministic hex on the rim
// ring (one inside the lane-gate ring), account-seeded so a heal re-places it in
// the same spot. Rim hexes are never the core, satisfying SeedFleet's guard.
func (s *Service) rimHex(accountId string) board.Hex {
	ring := board.RingHexes(s.params.RimRing)
	idx := int(uint64(seedFromAccount(accountId)) % uint64(len(ring)))
	return ring[idx]
}

// neighborsOf returns the systems one lane-hop from home — the onward lanes the
// wake charts to Rumored.
func neighborsOf(gal *galaxy.GeneratedGalaxy, home string) []string {
	var out []string
	for _, l := range gal.Lanes {
		switch home {
		case l.AId:
			out = append(out, l.BId)
		case l.BId:
			out = append(out, l.AId)
		}
	}
	return out
}
