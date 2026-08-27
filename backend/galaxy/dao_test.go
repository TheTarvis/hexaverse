package galaxy

import (
	"context"
	"sync"
	"testing"

	"hexaverse/common"
)

// emuService builds an emulator-backed service and the cleanup for its galaxy.
func emuService(t *testing.T) (*Service, Dao, func(ids ...string)) {
	fs, client := common.SetupFirestoreTestDAO(t)
	dao := NewDaoWithClient(fs)
	svc := NewServiceWith(dao, testClock())
	cleanup := func(ids ...string) {
		paths := []string{galaxiesCollection, pointersCollection}
		for _, id := range ids {
			paths = append(paths, SubcollectionPaths(id)...)
		}
		common.CleanupFirestoreTestData(t, client, paths...)
	}
	return svc, dao, cleanup
}

// testFieldParams keeps emulator work small: one block is a 2×2 cell tile.
func testFieldParams() GenerationParams {
	p := DefaultParams()
	p.BlockSize = 2
	p.MaxLaneLength = 150 // 2·78 = 156 > 150, strictly
	p.StartAreaBlockRadius = 1
	p.MinOriginComponentSystems = 3
	return p
}

func seededGalaxy(t *testing.T, svc *Service, seed int64) *Galaxy {
	t.Helper()
	meta, err := svc.Seed(context.Background(), seed, testFieldParams())
	if err != nil {
		t.Fatalf("Seed: %v", err)
	}
	return meta
}

func TestMaterialize_SeedsStartAreaAndReReads(t *testing.T) {
	svc, dao, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 101)
	defer cleanup(meta.Id)

	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if live.Galaxy.Id != meta.Id {
		t.Fatalf("live = %s, want %s", live.Galaxy.Id, meta.Id)
	}
	want := GenerateStartArea(101, testFieldParams())
	if len(live.Systems) != len(want.Systems) {
		t.Fatalf("materialized %d systems, want %d", len(live.Systems), len(want.Systems))
	}
	if len(live.Lanes) != len(want.Lanes) {
		t.Fatalf("materialized %d lanes, want %d", len(live.Lanes), len(want.Lanes))
	}
	// Bounds must contain every materialized system after the trigger completes.
	assertBoundsContain(t, live)

	// The origin is recorded and resolves to a real materialized system.
	if _, err := dao.GetSystem(ctx, meta.Id, meta.OriginSystemId); err != nil {
		t.Fatalf("origin system %s not materialized: %v", meta.OriginSystemId, err)
	}
}

// Re-materializing an anchored block must write nothing at all.
func TestMaterialize_ReMaterializationIsANoOp(t *testing.T) {
	svc, dao, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 202)
	defer cleanup(meta.Id)

	before, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	f := NewField(202, testFieldParams())
	for _, b := range StartAreaBlocks(testFieldParams()) {
		created, err := dao.MaterializeBlock(ctx, meta.Id, BlockMaterialization{
			Block:             b,
			Systems:           f.BlockSystems(b),
			Lanes:             f.BlockLanes(b),
			LaneSharingBlocks: laneSharingBlocks(f, b),
		})
		if err != nil {
			t.Fatalf("re-materialize %+v: %v", b, err)
		}
		if created {
			t.Fatalf("block %+v reported as created on re-materialization", b)
		}
	}
	after, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if len(after.Systems) != len(before.Systems) || len(after.Lanes) != len(before.Lanes) {
		t.Fatalf("re-materialization changed the world: %d/%d → %d/%d",
			len(before.Systems), len(before.Lanes), len(after.Systems), len(after.Lanes))
	}
	if after.Galaxy.BlockCount != before.Galaxy.BlockCount {
		t.Fatalf("block counter moved on a no-op: %d → %d", before.Galaxy.BlockCount, after.Galaxy.BlockCount)
	}
}

// Two triggers racing on the SAME block must converge on one anchor and one set
// of documents.
func TestMaterialize_ConcurrentSameBlockConverges(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 303)
	defer cleanup(meta.Id)

	target := Block{X: 4, Y: 4} // well outside the start area
	const racers = 4
	var wg sync.WaitGroup
	errs := make([]error, racers)
	for i := 0; i < racers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			errs[i] = svc.EnsureBlocks(ctx, target)
		}(i)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("racer %d: %v", i, err)
		}
	}

	want := NewField(303, testFieldParams()).BlockSystems(target)
	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	got := 0
	for _, s := range live.Systems {
		if CellBlockOf(s.Id, testFieldParams()) == target {
			got++
		}
	}
	if got != len(want) {
		t.Fatalf("block holds %d systems, want exactly %d (converged, not duplicated)", got, len(want))
	}
	assertBoundsContain(t, live)
}

// Two ADJACENT blocks materializing concurrently must keep every lane between
// them — the B3 regression. Whichever commits second sees the other's anchor
// (read inside the transaction) and writes the shared lanes.
func TestMaterialize_ConcurrentAdjacentBlocksKeepCrossLanes(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 404)
	defer cleanup(meta.Id)

	p := testFieldParams()
	f := NewField(404, p)
	left, right := Block{X: 5, Y: 0}, Block{X: 6, Y: 0}
	wantCross := map[string]bool{}
	for _, l := range f.BlockLanes(left) {
		if l.FarBlock(left) == right {
			wantCross[l.Id] = true
		}
	}
	if len(wantCross) == 0 {
		t.Skip("no cross-block lanes between the chosen fixture blocks")
	}

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, b := range []Block{left, right} {
		wg.Add(1)
		go func(i int, b Block) {
			defer wg.Done()
			errs[i] = svc.EnsureBlocks(ctx, b)
		}(i, b)
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("materializer %d: %v", i, err)
		}
	}

	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	seen := map[string]int{}
	for _, l := range live.Lanes {
		seen[l.Id]++
	}
	for id := range wantCross {
		if seen[id] != 1 {
			t.Fatalf("cross-block lane %s persisted %d times, want exactly 1", id, seen[id])
		}
	}
}

// Overlapping multi-block sets ({X,Y} vs {Y,Z}) converge block by block.
func TestMaterialize_OverlappingSetsConverge(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 505)
	defer cleanup(meta.Id)

	x, y, z := Block{X: -6, Y: 2}, Block{X: -5, Y: 2}, Block{X: -4, Y: 2}
	var wg sync.WaitGroup
	errs := make([]error, 2)
	wg.Add(2)
	go func() { defer wg.Done(); errs[0] = svc.EnsureBlocks(ctx, x, y) }()
	go func() { defer wg.Done(); errs[1] = svc.EnsureBlocks(ctx, y, z) }()
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			t.Fatalf("materializer %d: %v", i, err)
		}
	}

	p := testFieldParams()
	f := NewField(505, p)
	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	counts := map[Block]int{}
	for _, s := range live.Systems {
		counts[CellBlockOf(s.Id, p)]++
	}
	for _, b := range []Block{x, y, z} {
		if want := len(f.BlockSystems(b)); counts[b] != want {
			t.Fatalf("block %+v holds %d systems, want %d", b, counts[b], want)
		}
	}
}

// Reads must never create documents — the world grows only through its three
// declared writer seams.
func TestMaterialize_ReadsCreateNothing(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 606)
	defer cleanup(meta.Id)

	before, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	for i := 0; i < 3; i++ {
		if _, err := svc.GetLive(ctx); err != nil {
			t.Fatalf("GetLive: %v", err)
		}
		if _, err := svc.LiveGalaxyMeta(ctx); err != nil {
			t.Fatalf("LiveGalaxyMeta: %v", err)
		}
	}
	// An id far outside the materialized set: not found, and nothing appears.
	if _, err := svc.GetLiveSystem(ctx, SystemIdFor(Cell{X: 500, Y: 500})); err == nil {
		t.Fatal("an unmaterialized system id resolved")
	}
	after, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	if len(after.Systems) != len(before.Systems) || len(after.Lanes) != len(before.Lanes) {
		t.Fatalf("reads grew the world: %d/%d → %d/%d",
			len(before.Systems), len(before.Lanes), len(after.Systems), len(after.Lanes))
	}
}

// EnsureLaneHorizon on a frontier system must make its true field lanes
// enumerable — the property the scan seam and the spawn walk both rest on.
func TestMaterialize_EnsureLaneHorizonCompletesASystemsLanes(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 707)
	defer cleanup(meta.Id)

	p := testFieldParams()
	f := NewField(707, p)
	// A system on the start area's rim, whose onward neighbours are unmaterialized.
	rim := Block{X: p.StartAreaBlockRadius, Y: 0}
	edge := Block{X: rim.X - 1, Y: 0}
	systems := f.BlockSystems(edge)
	if len(systems) == 0 {
		t.Skip("no system on the start-area rim in this fixture")
	}
	target := systems[0].Id

	wantLanes := map[string]bool{}
	for _, l := range f.BlockLanes(f.BlockOf(mustCell(t, target))) {
		if l.AId == target || l.BId == target {
			wantLanes[l.Id] = true
		}
	}

	if err := svc.EnsureLaneHorizon(ctx, target); err != nil {
		t.Fatalf("EnsureLaneHorizon: %v", err)
	}
	ends, err := svc.LanesOf(ctx, target)
	if err != nil {
		t.Fatalf("LanesOf: %v", err)
	}
	got := map[string]bool{}
	for _, e := range ends {
		got[e.LaneId] = true
	}
	for id := range wantLanes {
		if !got[id] {
			t.Fatalf("lane %s missing after the horizon was ensured — a false dead end", id)
		}
	}
	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	assertBoundsContain(t, live)
}

// Bounds grow monotonically and always contain every materialized system.
func TestMaterialize_BoundsGrowMonotonically(t *testing.T) {
	svc, _, cleanup := emuService(t)
	ctx := context.Background()

	meta := seededGalaxy(t, svc, 808)
	defer cleanup(meta.Id)

	before, err := svc.LiveGalaxyMeta(ctx)
	if err != nil {
		t.Fatalf("LiveGalaxyMeta: %v", err)
	}
	if err := svc.EnsureBlocks(ctx, Block{X: 7, Y: 7}, Block{X: -7, Y: -7}); err != nil {
		t.Fatalf("EnsureBlocks: %v", err)
	}
	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	after := live.Galaxy
	if after.BlockCount <= before.BlockCount {
		t.Fatalf("block counter did not grow: %d → %d", before.BlockCount, after.BlockCount)
	}
	if after.Bounds.X[0] > before.Bounds.X[0] || after.Bounds.X[1] < before.Bounds.X[1] {
		t.Fatalf("bounds shrank: %+v → %+v", before.Bounds, after.Bounds)
	}
	assertBoundsContain(t, live)
}

func assertBoundsContain(t *testing.T, live *GeneratedGalaxy) {
	t.Helper()
	b := live.Galaxy.Bounds
	for _, s := range live.Systems {
		if s.Coords.X < b.X[0] || s.Coords.X > b.X[1] ||
			s.Coords.Y < b.Y[0] || s.Coords.Y > b.Y[1] ||
			s.Coords.Z < b.Z[0] || s.Coords.Z > b.Z[1] {
			t.Fatalf("system %s at %+v lies outside the reported bounds %+v", s.Id, s.Coords, b)
		}
	}
}

func mustCell(t *testing.T, systemID string) Cell {
	t.Helper()
	c, ok := CellForSystemId(systemID)
	if !ok {
		t.Fatalf("system id %q is not a field coordinate", systemID)
	}
	return c
}

// CellBlockOf resolves a system id's block, failing the test on a non-field id.
func CellBlockOf(systemID string, p GenerationParams) Block {
	b, ok := BlockOfSystem(systemID, p)
	if !ok {
		return Block{X: 1 << 30, Y: 1 << 30}
	}
	return b
}

// bridgeFieldParams is a sparse, void-riddled field so the bridge path is
// actually exercised — the production defaults are deliberately supercritical
// and produce no empty blocks at all.
func bridgeFieldParams() GenerationParams {
	p := DefaultParams()
	p.MaxLaneLength = 45
	p.BlockSize = 2
	p.BridgeSearchHorizon = 4
	p.HalfHeightZ = 4
	p.MinGapByRegion = map[string]float64{
		string(RegionStarRich): 30,
		string(RegionNormal):   30,
		string(RegionDead):     30,
		string(RegionBarrier):  30,
	}
	p.StartAreaBlockRadius = 1
	p.MinOriginComponentSystems = 1
	return p
}

// A bridge whose far endpoint lies BEYOND the 3×3 block window (it skips empty
// blocks) must still persist exactly once, from whichever side materializes
// second — the R2-B1 regression. Without the bridge horizon in the
// transaction's anchor reads, such a lane could never persist at all.
func TestMaterialize_BridgeAcrossEmptyBlocksPersistsOnce(t *testing.T) {
	fs, client := common.SetupFirestoreTestDAO(t)
	ctx := context.Background()
	dao := NewDaoWithClient(fs)
	svc := NewServiceWith(dao, testClock())

	p := bridgeFieldParams()
	meta, err := svc.Seed(ctx, 3, p)
	if err != nil {
		t.Fatalf("Seed: %v", err)
	}
	defer common.CleanupFirestoreTestData(t, client, append(
		[]string{galaxiesCollection, pointersCollection}, SubcollectionPaths(meta.Id)...)...)

	// Find a bridge that actually skips at least one empty block.
	f := NewField(3, p)
	var near, far Block
	var bridge FieldLane
	found := false
	for bx := -8; bx <= 8 && !found; bx++ {
		for by := -8; by <= 8 && !found; by++ {
			b := Block{X: bx, Y: by}
			for _, l := range f.bridgesFrom(b) {
				q := l.FarBlock(b)
				if maxInt(absInt(q.X-b.X), absInt(q.Y-b.Y)) > 1 {
					near, far, bridge, found = b, q, l, true
					break
				}
			}
		}
	}
	if !found {
		t.Skip("no empty-block-skipping bridge in this fixture")
	}

	// Materialize the two ends in order; the second side must write the bridge.
	if err := svc.EnsureBlocks(ctx, near); err != nil {
		t.Fatalf("EnsureBlocks(near): %v", err)
	}
	if err := svc.EnsureBlocks(ctx, far); err != nil {
		t.Fatalf("EnsureBlocks(far): %v", err)
	}

	live, err := svc.GetLive(ctx)
	if err != nil {
		t.Fatalf("GetLive: %v", err)
	}
	count := 0
	for _, l := range live.Lanes {
		if l.Id == bridge.Id {
			count++
			if !l.Bridge {
				t.Fatalf("bridge %s persisted without its bridge marker", l.Id)
			}
		}
	}
	if count != 1 {
		t.Fatalf("bridge %s (blocks %+v→%+v) persisted %d times, want exactly 1", bridge.Id, near, far, count)
	}

	// And it is enumerable as an incident lane from both endpoints.
	for _, id := range []string{bridge.AId, bridge.BId} {
		ends, err := svc.LanesOf(ctx, id)
		if err != nil {
			t.Fatalf("LanesOf(%s): %v", id, err)
		}
		seen := false
		for _, e := range ends {
			if e.LaneId == bridge.Id {
				seen = true
			}
		}
		if !seen {
			t.Fatalf("bridge %s not incident to %s", bridge.Id, id)
		}
	}
}
