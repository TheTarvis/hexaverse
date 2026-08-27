package corporations

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"hexaverse/board"
	"hexaverse/common"
	"hexaverse/fleet"
	"hexaverse/galaxy"
	"hexaverse/observation"
	"hexaverse/polar"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

var (
	ErrNotFound       = errors.New("corporation not found")
	ErrForbidden      = errors.New("forbidden")
	ErrNameRequired   = errors.New("corporation name is required")
	ErrHasLivingFleet = errors.New("corporation still has a living fleet")
)

// GraphSource is the galaxy dependency. Since the galaxy became an infinite
// field materialized lazily, site selection can no longer load "the graph": it
// WALKS, one system at a time, materializing each visited system's lane horizon
// before expanding past it — so the world grows ahead of the search instead of
// the search hitting the storage frontier and 503ing.
type GraphSource interface {
	// GetLiveSystem reads one materialized system (qualification + the home DTO
	// the wake returns).
	GetLiveSystem(ctx context.Context, systemID string) (*galaxy.System, error)
	// LiveGalaxyMeta carries the recorded origin system (where a fresh world's
	// first walk begins) and the block size the walk measures its depth in.
	LiveGalaxyMeta(ctx context.Context) (*galaxy.Galaxy, error)
	// GetLiveSystems reads a whole hop-ring's systems in one fan-out — the
	// qualification step.
	GetLiveSystems(ctx context.Context, systemIDs []string) ([]galaxy.System, error)
	// LaneHorizonBlocks is the pure block set the given systems' incident lanes
	// can reach; EnsureBlocks materializes them. Split, and batched over a whole
	// ring, so the walk pays one ensure per new block rather than one per system
	// (neighbouring systems' horizons overlap almost entirely).
	LaneHorizonBlocks(ctx context.Context, systemIDs []string) ([]galaxy.Block, error)
	EnsureBlocks(ctx context.Context, blocks ...galaxy.Block) error
	// NeighborsOfMany is the walk's expansion step: one ring's adjacency over
	// materialized lanes.
	NeighborsOfMany(ctx context.Context, systemIDs []string) (map[string][]string, error)
}

// FleetSource places the starting hull and answers the death invariant's
// fleet-count question. Cross-domain through the service, never the DAO.
type FleetSource interface {
	SeedFleet(ctx context.Context, systemID, corporationID string, at board.Cell) (*fleet.Fleet, error)
	ListForCorp(ctx context.Context, corporationID string) ([]fleet.Fleet, error)
}

// FogSource writes the initial observations and reads other corps' explored sets
// for the unclaimed-distance test. Spawn charts NO lanes (#0006 Decision #17,
// 2026-07-14): the first home scan finds the roads — the wake-up tutorial beat.
type FogSource interface {
	RevealArrival(ctx context.Context, cid, destSystemID string, at common.WorldMillis) error
	SystemTiers(ctx context.Context, cid string) (map[string]observation.Tier, error)
}

// StationSource provisions the home system's NPC trading station as a spawn
// asset (#0011). Idempotent per system id — two corporations sharing a home
// converge on ONE station, never one each. Declared here (consumer-side) so
// corporations depends on a narrow interface, not the stations package.
type StationSource interface {
	EnsureStation(ctx context.Context, systemID string) error
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
	// Balance returns the corp's materialized credit balance (#0011). Owner-only:
	// the handler resolves corpID from common.ActorCorp before calling.
	Balance(ctx context.Context, corpID string) (int64, error)
	// Ledger returns one bounded page of the corp's trade ledger, newest first.
	Ledger(ctx context.Context, corpID, cursor string, pageSize int) (*LedgerPage, error)
}

type Service struct {
	dao    Dao
	graph  GraphSource
	fleets FleetSource
	fog    FogSource
	clock  common.WorldTime
	params SpawnParams
	// credits is the transactional balance/ledger surface (#0011). Non-nil in
	// production; a nil store makes the credit steps of healing no-ops, so every
	// pre-#0011 test that constructs a Service without it still passes.
	credits *CreditStore
	// stations provisions the home station during asset healing. Nil ⇒ skipped,
	// same tolerance as credits.
	stations StationSource
	// startingCredits is market.Params.StartingCredits, INJECTED rather than
	// imported: market imports corporations (for the credit primitive), so
	// corporations importing market would cycle. router.go is the one place the
	// two meet.
	startingCredits int64
}

// NewService wires the corporation domain. The galaxy/fleet/fog services are the
// SAME instances router.go already constructed (fog + fleet share the action
// spine), so spawn orchestrates through live singletons, not fresh copies.
func NewService(graph GraphSource, fleets FleetSource, fog FogSource) *Service {
	params := DefaultSpawnParams()
	// The walk's caps are validated at construction, not at the first wake: a
	// non-positive depth or re-pick budget is a boot-time misconfiguration, and
	// the only thing worse than failing loudly here is 503ing a player later.
	if err := params.Validate(); err != nil {
		panic(err)
	}
	return &Service{
		dao:     NewDao(),
		graph:   graph,
		fleets:  fleets,
		fog:     fog,
		clock:   common.WorldClock(),
		params:  params,
		credits: NewCreditStore(),
	}
}

// WithSpawnParams overrides the placement knobs — the seam tests use to induce
// the defensive rails (an artificially low walk cap or re-pick budget).
func (s *Service) WithSpawnParams(p SpawnParams) *Service {
	s.params = p
	return s
}

// WithMarket wires the #0011 spawn assets: the home station's provisioner and
// the opening credit grant's size (market.Params.StartingCredits, injected — see
// Service.startingCredits). Follows the post-construction wiring shape
// fleetSvc.WithTravel already uses for a dependency that isn't available at
// construction time. Returns the service so it can be chained.
func (s *Service) WithMarket(stations StationSource, startingCredits int64) *Service {
	s.stations = stations
	s.startingCredits = startingCredits
	return s
}

// WithCreditStore swaps the credit store — the seam an emulator-backed test uses
// to point the ledger at its own Firestore client.
func (s *Service) WithCreditStore(store *CreditStore) *Service {
	s.credits = store
	return s
}

// Credits exposes the store for the handler's owner-only balance/ledger reads.
func (s *Service) Credits() *CreditStore { return s.credits }

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

	// Fresh wake. Site selection runs BEFORE the corp commit: a wake that cannot
	// place its hull must leave the account corpless and retryable — never a
	// fleetless zombie corp that gates the player into the game with no ship.
	// A spawn that loses the create-if-absent reservation race to a DIFFERENT
	// account re-runs selection, which now sees the winner's reservation and
	// lands elsewhere — bounded by MaxSpawnRepicks.
	for attempt := 0; attempt <= s.params.MaxSpawnRepicks; attempt++ {
		site, err := s.pickSpawnSite(ctx, "", accountId)
		if err != nil {
			return nil, err
		}

		// The corp doc + account pointer + home reservation commit in ONE
		// transaction (the spawn anchor); the hull + fog follow through their
		// services, healed on retry by the idempotent path above.
		corp := Corporation{
			Id:           "corp_" + uuid.NewString(),
			AccountId:    accountId,
			Name:         name,
			CreatedAt:    s.clock.Now(),
			HomeSystemId: site.Id,
		}
		err = s.dao.CreateWithPointer(ctx, corp)
		switch {
		case err == nil:
			log.Info().Ctx(ctx).Str("corpId", corp.Id).Str("accountId", accountId).
				Str("homeSystem", corp.HomeSystemId).Msg("Corporation woke")
			return s.ensureSpawnAssets(ctx, &corp)

		case errors.Is(err, ErrAccountHasCorp):
			// A concurrent spawn for the SAME account won the pointer — return the
			// winner's corp. Never a re-pick: this account already has its home.
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

		case errors.Is(err, ErrSiteReserved):
			log.Info().Ctx(ctx).Str("accountId", accountId).Str("site", site.Id).
				Int("attempt", attempt).Msg("Spawn site reserved by another account — re-picking")
			continue

		default:
			return nil, err
		}
	}
	return nil, fmt.Errorf("%w: %d re-picks all lost the reservation race", ErrNoSpawnSite, s.params.MaxSpawnRepicks)
}

// ensureSpawnAssets makes the corp's derived assets exist (idempotently): its one
// hull in the home system, and the initial fog (home Explored — no lanes;
// scanning home is the first taught verb, #0006 Decision #17). Safe to re-run —
// an existing hull is reused, the fog upserts are monotonic — which is what
// makes spawn idempotent per account.
//
// The home is the one RECORDED ON THE CORP DOC in the same transaction as the
// corp itself. Healing therefore reuses the corporation's own committed choice
// instead of re-running selection — which would both drift (the world state has
// moved on) and strand an orphaned reservation on the newly picked system.
func (s *Service) ensureSpawnAssets(ctx context.Context, corp *Corporation) (*SpawnResult, error) {
	now := s.clock.Now()

	fleets, err := s.fleets.ListForCorp(ctx, corp.Id)
	if err != nil {
		return nil, err
	}

	home := corp.HomeSystemId
	if home == "" && len(fleets) > 0 {
		home = fleets[0].SystemId // defensive: a corp doc predating the recorded home
	}
	if home == "" {
		return nil, fmt.Errorf("%w: corporation %s has no recorded home system", ErrNotFound, corp.Id)
	}

	var hull *fleet.Fleet
	if len(fleets) > 0 {
		hull = &fleets[0]
	} else {
		hull, err = s.fleets.SeedFleet(ctx, home, corp.Id, s.rimCell(corp.AccountId, board.ProductionSchedule()))
		if err != nil {
			return nil, err
		}
	}

	if err := s.fog.RevealArrival(ctx, corp.Id, home, now); err != nil {
		return nil, err
	}

	// #0011: the home station and the opening balance are spawn assets too, and
	// heal on the same idempotent pass every other asset does.
	if err := s.ensureStation(ctx, home); err != nil {
		return nil, err
	}
	if err := s.ensureOpeningGrant(ctx, corp, now); err != nil {
		return nil, err
	}
	if err := s.markAssetsComplete(ctx, corp, now); err != nil {
		return nil, err
	}

	homeSys, err := s.graph.GetLiveSystem(ctx, home)
	if err != nil {
		return nil, err
	}
	return &SpawnResult{Corporation: *corp, Fleet: hull, HomeSystem: homeSys, WorldTime: now}, nil
}

// healAssets is the read path's healing pass (#0011 Decision 14): GET
// /v1/corporations/me runs it so a pre-#0011 corporation — one that only ever
// reads and never re-spawns — gains its station and balance on its very next
// session bootstrap, with no backfill script and no explicit re-spawn.
//
// The assets-complete marker short-circuits at entry reading NOTHING but the
// marker already on the corp doc in hand: a healed corp's every later read costs
// zero extra reads and zero writes.
func (s *Service) healAssets(ctx context.Context, corp *Corporation) error {
	if corp.AssetsCompleteAt != 0 {
		return nil
	}
	if _, err := s.ensureSpawnAssets(ctx, corp); err != nil {
		return err
	}
	return nil
}

// ensureStation provisions the home system's NPC station, idempotently per
// system id. Two corporations sharing a home system converge on one station.
func (s *Service) ensureStation(ctx context.Context, systemID string) error {
	if s.stations == nil {
		return nil
	}
	return s.stations.EnsureStation(ctx, systemID)
}

// ensureOpeningGrant credits the configured starting balance exactly once, keyed
// by the DERIVED "spawn:"+corpId anchor — a namespace ValidateOperationKey
// forbids any client from supplying, so nobody can squat or suppress it.
//
// "Already granted" is decided ONLY by that ledger entry's existence, never by
// Credits == 0: a corporation can legitimately spend to exactly zero, and
// re-granting it would be a silent faucet.
func (s *Service) ensureOpeningGrant(ctx context.Context, corp *Corporation, now common.WorldMillis) error {
	if s.credits == nil || s.startingCredits <= 0 {
		return nil
	}
	_, err := s.credits.ApplyCredit(ctx, corp.Id, spawnGrantKey(corp.Id), LedgerEntry{
		AccountId: corp.AccountId,
		Kind:      EntryStartingGrant,
		Amount:    s.startingCredits,
	}, now)
	if err != nil {
		// A replay is the normal healed path, not an error — ApplyCredit already
		// answers it from the recorded entry. Anything else is real.
		return err
	}
	return nil
}

// markAssetsComplete stamps the short-circuit marker once every derived asset is
// confirmed present. Written last, so a pass that failed part-way never marks
// itself done and the next call re-heals.
func (s *Service) markAssetsComplete(ctx context.Context, corp *Corporation, now common.WorldMillis) error {
	if corp.AssetsCompleteAt != 0 {
		return nil
	}
	if err := s.dao.SetAssetsCompleteAt(ctx, corp.Id, now); err != nil {
		return err
	}
	corp.AssetsCompleteAt = now
	return nil
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
	// The migration mechanism (#0011 Decision 14): the pure-read session bootstrap
	// drives the same idempotent healing pass a spawn call does, so a corporation
	// that predates the station/balance assets gains them here. A healed corp
	// short-circuits on its marker — this costs it nothing.
	if err := s.healAssets(ctx, corp); err != nil {
		return nil, err
	}
	// Re-read: healing granted the opening balance through its own transaction, so
	// the in-hand copy's Credits is stale on the pass that actually healed.
	if corp.AssetsCompleteAt != 0 && corp.Credits == 0 {
		if fresh, err := s.dao.Get(ctx, corpID); err == nil && fresh != nil {
			corp = fresh
		}
	}
	return corp, nil
}

// ReconcileLedgers is the periodic cadence's body (#0011 Decision 18): it
// evaluates EVERY living corporation's reconciliation state, independently of
// whether any mutation happened — a corporation that traded nothing this cycle
// is still checked. Returns the divergent results.
//
// Driven by an OIDC-verified push route on a Cloud Scheduler cadence, the same
// liveness-floor shape action's sweep already uses. Correctness never depends on
// it firing: the O(1) write-time chained check catches a divergence at the
// moment it would occur, and this is the backstop that finds one nobody's next
// mutation would have surfaced.
func (s *Service) ReconcileLedgers(ctx context.Context) ([]ReconResult, error) {
	if s.credits == nil {
		return nil, nil
	}
	living, err := s.dao.ListLiving(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(living))
	for i := range living {
		ids = append(ids, living[i].Id)
	}
	return s.credits.ReconcileAll(ctx, ids)
}

// Balance returns a corporation's materialized credit balance. Owner-only: the
// caller (the handler) resolves corpID from common.ActorCorp, so a foreign id
// can never be reached through this seam.
func (s *Service) Balance(ctx context.Context, corpID string) (int64, error) {
	corp, err := s.dao.Get(ctx, corpID)
	if err != nil {
		return 0, err
	}
	if corp == nil {
		return 0, ErrNotFound
	}
	return corp.Credits, nil
}

// Ledger returns one bounded page of a corporation's trade ledger, newest first.
// Owner-only by the same seam as Balance.
func (s *Service) Ledger(ctx context.Context, corpID, cursor string, pageSize int) (*LedgerPage, error) {
	if s.credits == nil {
		return &LedgerPage{Entries: []LedgerEntry{}}, nil
	}
	return s.credits.ListLedger(ctx, corpID, cursor, pageSize)
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

// pickSpawnSite walks outward from settled space, materializing as it goes, and
// returns the wake-up system for accountId. exceptCorpID is excluded from the
// claimed-space measurement so a re-pick doesn't fence itself out; "" excludes
// nothing (the fresh-wake corp isn't living yet, so there's nothing to exclude).
func (s *Service) pickSpawnSite(ctx context.Context, exceptCorpID, accountId string) (*galaxy.System, error) {
	claimed, err := s.claimedSpace(ctx, exceptCorpID)
	if err != nil {
		return nil, err
	}
	reserved, err := s.dao.ListSpawnClaims(ctx)
	if err != nil {
		return nil, err
	}
	return selectSpawnSite(ctx, s.graph, s.params, claimed, reserved, accountId)
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

// rimCell is the starting hull's coast position: a deterministic cell on the
// rim ring (one inside the lane-gate ring), account-seeded so a heal
// re-places it in the same spot. Rim cells are never the core, satisfying
// SeedFleet's guard.
//
// design.md Decision 5: no board.RingCells enumeration — asking the live
// schedule's slot count for RimRing and taking the account-seeded modulus is
// the same discretized choice with no allocation, and it draws from the
// SCHEDULE's real slot count rather than a fixed per-ring assumption.
func (s *Service) rimCell(accountId string, sched polar.Schedule) board.Cell {
	slots := sched.Slots(s.params.RimRing)
	slot := int(uint64(seedFromAccount(accountId)) % uint64(slots))
	return board.Cell{Ring: s.params.RimRing, Slot: slot}
}
