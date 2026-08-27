package galaxy

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"hexaverse/common"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
)

// ErrNoLiveGalaxy means no galaxy has been seeded for this environment yet.
var ErrNoLiveGalaxy = errors.New("no live galaxy")

// ErrSystemNotFound means the requested system id isn't materialized in the live
// galaxy. Reads never materialize — players can only name ids that a read or a
// scan already handed them.
var ErrSystemNotFound = errors.New("system not found")

// ErrDegenerateStartArea means a seed's origin neighborhood failed seed-time
// validation: no origin survivor, an origin component below the floor, or no
// mineable system in it. An ops error, caught before anything goes live — never
// a runtime state.
var ErrDegenerateStartArea = errors.New("degenerate start area")

type ServiceInterface interface {
	// Seed materializes a fresh galaxy's start area under a new id, validates
	// the origin neighborhood, and points "live" at it. Re-runnable — never
	// corrupts the prior galaxy (it stays at its old id; only the pointer moves).
	Seed(ctx context.Context, seed int64, params GenerationParams) (*Galaxy, error)
	// GetLive returns the current live galaxy's MATERIALIZED subset (metadata +
	// every persisted system and lane). Not "the galaxy" — the field is
	// unbounded; this is what collective observation has caused to exist.
	GetLive(ctx context.Context) (*GeneratedGalaxy, error)
	// GetLiveSystem returns a single materialized system node from the live
	// galaxy. Creates nothing: an unmaterialized id is ErrSystemNotFound.
	GetLiveSystem(ctx context.Context, systemID string) (*System, error)
	// LiveGalaxyMeta returns the current live galaxy's metadata doc (id, seed,
	// params, materialized bounds, origin system) — one cheap read.
	LiveGalaxyMeta(ctx context.Context) (*Galaxy, error)
	// EnsureLaneHorizon materializes a system's FULL LANE HORIZON — its block's
	// 3×3 window plus the far-endpoint block of every bridge incident to it — so
	// the system's true incident lanes are all persisted. Idempotent and cheap
	// when already materialized. This is the seam every trigger that can look
	// past the frontier (scan resolution, the spawn walk) calls.
	EnsureLaneHorizon(ctx context.Context, systemID string) error
	// LaneHorizonBlocks is the PURE half of EnsureLaneHorizon: the deduped block
	// set the given systems' incident lanes can reach, computed from the field
	// alone. Batched because the spawn walk advances a whole hop-RING at a time,
	// and neighbouring systems' horizons overlap almost entirely.
	LaneHorizonBlocks(ctx context.Context, systemIDs []string) ([]Block, error)
	// EnsureBlocks materializes specific blocks, create-if-absent.
	EnsureBlocks(ctx context.Context, blocks ...Block) error
	// NeighborsOf returns the ids reachable from a system over materialized
	// lanes.
	NeighborsOf(ctx context.Context, systemID string) ([]string, error)
	// NeighborsOfMany is the spawn walk's expansion step: one ring's adjacency
	// in a handful of queries rather than two per system.
	NeighborsOfMany(ctx context.Context, systemIDs []string) (map[string][]string, error)
	// GetLiveSystems point-reads a set of materialized systems — the walk's
	// qualification step over one ring.
	GetLiveSystems(ctx context.Context, systemIDs []string) ([]System, error)
}

type Service struct {
	dao   Dao
	clock common.WorldTime

	// fields memoizes the (seed, params) → Field derivation per galaxy id. The
	// galaxy doc's seed and params are immutable once written (only bounds and
	// the block counter grow), so this can never go stale.
	mu     sync.Mutex
	fields map[string]GenerationParams
	seeds  map[string]int64
}

func NewService() *Service {
	return &Service{dao: NewDao(), clock: common.WorldClock(), fields: map[string]GenerationParams{}, seeds: map[string]int64{}}
}

func NewServiceWith(dao Dao, clock common.WorldTime) *Service {
	return &Service{dao: dao, clock: clock, fields: map[string]GenerationParams{}, seeds: map[string]int64{}}
}

// --- Seeding ----------------------------------------------------------------

// Seed validates the params and the seed's origin neighborhood, materializes the
// start-area blocks under a fresh id, records the origin system, and only then
// repoints "live". Validation is pure and runs first, so a rejected seed
// persists nothing at all.
func (s *Service) Seed(ctx context.Context, seed int64, params GenerationParams) (*Galaxy, error) {
	if err := params.Validate(); err != nil {
		return nil, err
	}
	start := GenerateStartArea(seed, params)
	rep := InspectStartArea(start)
	switch {
	case rep.OriginSystemId == "":
		return nil, fmt.Errorf("%w: seed %d has no surviving system in the start area", ErrDegenerateStartArea, seed)
	case rep.ComponentSize < params.MinOriginComponentSystems:
		return nil, fmt.Errorf("%w: seed %d's origin component holds %d systems, below the floor of %d",
			ErrDegenerateStartArea, seed, rep.ComponentSize, params.MinOriginComponentSystems)
	case !rep.ComponentHasOre:
		return nil, fmt.Errorf("%w: seed %d's origin component has no mineable system", ErrDegenerateStartArea, seed)
	}

	meta := Galaxy{
		Id:             fmt.Sprintf("gal_%s", uuid.NewString()),
		Seed:           seed,
		Params:         params,
		Version:        2,
		CreatedAt:      s.clock.Now(),
		OriginSystemId: rep.OriginSystemId,
	}
	if err := s.dao.SaveGalaxyMeta(ctx, meta); err != nil {
		return nil, fmt.Errorf("persisting galaxy metadata: %w", err)
	}
	if err := s.ensureBlocksIn(ctx, meta.Id, NewField(seed, params), StartAreaBlocks(params)); err != nil {
		// The blocks written so far stay under this (never-live) galaxy id —
		// acceptable garbage, never served.
		return nil, fmt.Errorf("materializing start area: %w", err)
	}
	if err := s.dao.SetLivePointer(ctx, meta.Id); err != nil {
		return nil, fmt.Errorf("setting live pointer: %w", err)
	}

	log.Info().Ctx(ctx).
		Str("galaxyId", meta.Id).
		Int64("seed", seed).
		Str("originSystem", meta.OriginSystemId).
		Int("startAreaSystems", len(start.Systems)).
		Msg("Seeded and set live galaxy")
	return &meta, nil
}

// --- Materialization --------------------------------------------------------

// EnsureBlocks materializes the given blocks of the live galaxy, create-if-absent.
func (s *Service) EnsureBlocks(ctx context.Context, blocks ...Block) error {
	id, f, err := s.liveField(ctx)
	if err != nil {
		return err
	}
	return s.ensureBlocksIn(ctx, id, f, blocks)
}

// EnsureLaneHorizon materializes everything a system's incident lanes can reach:
// its block's 3×3 window (ordinary lanes, diagonals included) plus the far block
// of each incident bridge. After it returns, the system's persisted lanes ARE
// its true field lanes — which is what lets a scan never report a false dead
// end and lets the spawn walk expand past the frontier.
func (s *Service) EnsureLaneHorizon(ctx context.Context, systemID string) error {
	id, f, err := s.liveField(ctx)
	if err != nil {
		return err
	}
	horizon := f.LaneHorizon(systemID)
	if len(horizon) == 0 {
		return nil // not a field-coordinate id — nothing derivable to materialize
	}
	return s.ensureBlocksIn(ctx, id, f, horizon)
}

// LaneHorizonBlocks computes the union of the given systems' full lane horizons
// without touching storage beyond the live pointer. Ids that are not field
// coordinates contribute nothing.
func (s *Service) LaneHorizonBlocks(ctx context.Context, systemIDs []string) ([]Block, error) {
	_, f, err := s.liveField(ctx)
	if err != nil {
		return nil, err
	}
	seen := map[Block]bool{}
	var out []Block
	for _, id := range systemIDs {
		for _, b := range f.LaneHorizon(id) {
			if seen[b] {
				continue
			}
			seen[b] = true
			out = append(out, b)
		}
	}
	return out, nil
}

func (s *Service) ensureBlocksIn(ctx context.Context, galaxyID string, f *Field, blocks []Block) error {
	if len(blocks) == 0 {
		return nil
	}
	present, err := s.dao.MaterializedBlocks(ctx, galaxyID, blocks)
	if err != nil {
		return err
	}

	// The extent merge is batched across this call and runs on EVERY exit path,
	// including the error path, so bounds always contain everything the call
	// actually materialized. Batching matters: a lane horizon is nine blocks, and
	// merging per block would put nine transactions on the single galaxy document
	// where one does — the write hotspot D7 exists to avoid.
	var extent Bounds
	created := 0
	merge := func() error {
		if created == 0 {
			return nil
		}
		return s.dao.MergeExtent(ctx, galaxyID, extent, created)
	}

	for _, b := range blocks {
		if present[b] {
			continue
		}
		systems := f.BlockSystems(b)
		wrote, err := s.dao.MaterializeBlock(ctx, galaxyID, BlockMaterialization{
			Block:             b,
			Systems:           systems,
			Lanes:             f.BlockLanes(b),
			LaneSharingBlocks: laneSharingBlocks(f, b),
		})
		if err != nil {
			_ = merge() // keep what did land visible
			return err
		}
		if !wrote {
			continue // another trigger got there first — converged, nothing to do
		}
		created++
		if bounds, any := boundsOfSystems(systems); any {
			extent = extent.Union(bounds) // an empty block grows the counter, not the extent
		}
	}
	return merge()
}

// laneSharingBlocks is every OTHER block that can share a lane with b: the eight
// neighbours (an ordinary lane reaches no further, by the
// BlockSize·cellSize > MaxLaneLength invariant) plus the far block of each
// incident bridge, which skips empty blocks and so can lie beyond them.
func laneSharingBlocks(f *Field, b Block) []Block {
	out := make([]Block, 0, 12)
	seen := map[Block]bool{b: true}
	for _, n := range BlockWindow(b) {
		if seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	for _, n := range f.BridgeFarBlocks(b) {
		if seen[n] {
			continue
		}
		seen[n] = true
		out = append(out, n)
	}
	return out
}

// liveField resolves the live galaxy id and the field its seed and params
// define. The (seed, params) pair is immutable per galaxy id, so it is memoized;
// the live pointer is read every time, because a reseed moves it.
func (s *Service) liveField(ctx context.Context) (string, *Field, error) {
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return "", nil, err
	}
	if id == "" {
		return "", nil, ErrNoLiveGalaxy
	}

	s.mu.Lock()
	params, ok := s.fields[id]
	seed := s.seeds[id]
	s.mu.Unlock()
	if !ok {
		meta, err := s.dao.GetGalaxyMeta(ctx, id)
		if err != nil {
			return "", nil, err
		}
		if meta == nil {
			return "", nil, ErrNoLiveGalaxy
		}
		params, seed = meta.Params, meta.Seed
		s.mu.Lock()
		s.fields[id], s.seeds[id] = params, seed
		s.mu.Unlock()
	}
	return id, NewField(seed, params), nil
}

// --- Reads ------------------------------------------------------------------

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

// NeighborsOf returns the systems one materialized lane away.
func (s *Service) NeighborsOf(ctx context.Context, systemID string) ([]string, error) {
	byID, err := s.NeighborsOfMany(ctx, []string{systemID})
	if err != nil {
		return nil, err
	}
	return byID[systemID], nil
}

// NeighborsOfMany returns one hop-ring's adjacency in a handful of queries. The
// spawn walk expands over this — after the ring's lane horizon is ensured, it is
// the true field adjacency, not the persisted frontier.
func (s *Service) NeighborsOfMany(ctx context.Context, systemIDs []string) (map[string][]string, error) {
	out := make(map[string][]string, len(systemIDs))
	if len(systemIDs) == 0 {
		return out, nil
	}
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}
	lanes, err := s.dao.ListLanesForSystems(ctx, id, systemIDs)
	if err != nil {
		return nil, err
	}
	want := make(map[string]bool, len(systemIDs))
	for _, sid := range systemIDs {
		want[sid] = true
	}
	for _, l := range lanes {
		if want[l.AId] {
			out[l.AId] = append(out[l.AId], l.BId)
		}
		if want[l.BId] {
			out[l.BId] = append(out[l.BId], l.AId)
		}
	}
	return out, nil
}

// GetLiveSystems point-reads a set of materialized systems; ids absent from the
// materialized set are simply omitted.
func (s *Service) GetLiveSystems(ctx context.Context, systemIDs []string) ([]System, error) {
	if len(systemIDs) == 0 {
		return nil, nil
	}
	id, err := s.dao.GetLivePointer(ctx)
	if err != nil {
		return nil, err
	}
	if id == "" {
		return nil, ErrNoLiveGalaxy
	}
	return s.dao.GetSystems(ctx, id, systemIDs)
}
