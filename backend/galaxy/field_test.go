package galaxy

import (
	"fmt"
	"math"
	"reflect"
	"testing"
)

// testParams is the field shape unit tests derive from — the production
// defaults, so what the tests pin is what the world ships with.
func testParams() GenerationParams { return DefaultParams() }

// blockSet materializes a set of blocks in memory, the way the block
// materializer would, and returns them keyed for comparison.
func blockSet(f *Field, blocks ...Block) (map[string]System, map[string]Lane) {
	systems := map[string]System{}
	lanes := map[string]Lane{}
	for _, b := range blocks {
		for _, s := range f.BlockSystems(b) {
			systems[s.Id] = s
		}
		for _, l := range f.BlockLanes(b) {
			lanes[l.Id] = l.Lane
		}
	}
	return systems, lanes
}

func TestField_Deterministic(t *testing.T) {
	blocks := []Block{{X: 0, Y: 0}, {X: 1, Y: 0}, {X: -2, Y: 3}}
	aS, aL := blockSet(NewField(7, testParams()), blocks...)
	bS, bL := blockSet(NewField(7, testParams()), blocks...)

	if !reflect.DeepEqual(aS, bS) {
		t.Fatal("same seed produced different systems")
	}
	if !reflect.DeepEqual(aL, bL) {
		t.Fatal("same seed produced different lanes")
	}
}

func TestField_DifferentSeedsDiffer(t *testing.T) {
	blocks := []Block{{X: 0, Y: 0}, {X: 1, Y: 1}}
	aS, _ := blockSet(NewField(1, testParams()), blocks...)
	bS, _ := blockSet(NewField(2, testParams()), blocks...)
	if reflect.DeepEqual(aS, bS) {
		t.Fatal("different seeds produced identical systems")
	}
}

// Order independence is the property the whole lazy-materialization model rests
// on: A-then-B must equal B-then-A, because two players' triggers arrive in
// whatever order they arrive.
func TestField_OrderIndependent(t *testing.T) {
	a, b := Block{X: 0, Y: 0}, Block{X: 1, Y: 0}
	f := NewField(11, testParams())
	fwdS, fwdL := blockSet(f, a, b)
	revS, revL := blockSet(NewField(11, testParams()), b, a)

	if !reflect.DeepEqual(fwdS, revS) {
		t.Fatal("materialization order changed the systems")
	}
	if !reflect.DeepEqual(fwdL, revL) {
		t.Fatal("materialization order changed the lanes")
	}
}

func TestField_MinimumSpacingRespected(t *testing.T) {
	p := testParams()
	f := NewField(9, p)
	cands := f.survivorsIn(CellRect{MinX: -12, MinY: -12, MaxX: 12, MaxY: 12})
	for i := 0; i < len(cands); i++ {
		for j := i + 1; j < len(cands); j++ {
			required := math.Max(p.MinGapByRegion[string(cands[i].region)], p.MinGapByRegion[string(cands[j].region)])
			if d := dist(cands[i].coords, cands[j].coords); d < required {
				t.Fatalf("%s and %s are %.2f apart, below the larger region gap %.2f",
					SystemIdFor(cands[i].cell), SystemIdFor(cands[j].cell), d, required)
			}
		}
	}
}

// A cell's survival must be decidable from its 3×3 window alone — the locality
// guarantee that makes any block computable without the rest of the world.
func TestField_SurvivalIsLocal(t *testing.T) {
	p := testParams()
	near := NewField(5, p)
	far := NewField(5, p)
	// Touch a distant region on one field only. If survival leaked beyond the
	// 3×3 window, the memoized state would diverge.
	far.survivorsIn(CellRect{MinX: 400, MinY: -400, MaxX: 410, MaxY: -390})
	for x := -3; x <= 3; x++ {
		for y := -3; y <= 3; y++ {
			if near.Survives(Cell{X: x, Y: y}) != far.Survives(Cell{X: x, Y: y}) {
				t.Fatalf("cell (%d,%d) survival depended on distant computation", x, y)
			}
		}
	}
}

func TestField_OrdinaryLanesNeverExceedTheCap(t *testing.T) {
	p := testParams()
	f := NewField(13, p)
	byId := map[string]System{}
	for _, b := range []Block{{X: 0, Y: 0}, {X: 1, Y: 0}, {X: 0, Y: 1}, {X: 1, Y: 1}} {
		for _, s := range f.BlockSystems(b) {
			byId[s.Id] = s
		}
	}
	checked := 0
	for _, b := range []Block{{X: 0, Y: 0}, {X: 1, Y: 1}} {
		for _, l := range f.BlockLanes(b) {
			if l.Bridge {
				continue
			}
			a, ok1 := byId[l.AId]
			c, ok2 := byId[l.BId]
			if !ok1 || !ok2 {
				continue
			}
			checked++
			if d := dist(a.Coords, c.Coords); d > p.MaxLaneLength {
				t.Fatalf("ordinary lane %s spans %.2f, above the cap %.2f", l.Id, d, p.MaxLaneLength)
			}
		}
	}
	if checked == 0 {
		t.Fatal("no ordinary lanes checked — the fixture produced no roads")
	}
}

func TestField_LanesReferenceRealDistinctSystems(t *testing.T) {
	f := NewField(8, testParams())
	b := Block{X: 0, Y: 0}
	present := map[string]bool{}
	for _, n := range BlockWindow(b) {
		for _, s := range f.BlockSystems(n) {
			present[s.Id] = true
		}
	}
	for _, l := range f.BlockLanes(b) {
		if l.AId == l.BId {
			t.Fatalf("lane %s is a self-loop", l.Id)
		}
		if !present[l.AId] || !present[l.BId] {
			// A bridge may reach beyond the 3×3 window; its far system must still
			// be a real survivor at that cell.
			for _, id := range []string{l.AId, l.BId} {
				cell, ok := CellForSystemId(id)
				if !ok || !f.Survives(cell) {
					t.Fatalf("lane %s references a non-system endpoint %s", l.Id, id)
				}
			}
		}
	}
}

// Lane stability is what makes lazy materialization safe: computing a lane from
// either side, in any order, must give the same answer and the same document
// id, so a later block can never contradict a persisted lane.
func TestField_LaneStabilityUnderAdjacentMaterialization(t *testing.T) {
	f := NewField(21, testParams())
	a, b := Block{X: 0, Y: 0}, Block{X: 1, Y: 0}
	fromA := map[string]Lane{}
	for _, l := range f.BlockLanes(a) {
		if l.ABlock == b || l.BBlock == b {
			fromA[l.Id] = l.Lane
		}
	}
	fromB := map[string]Lane{}
	for _, l := range f.BlockLanes(b) {
		if l.ABlock == a || l.BBlock == a {
			fromB[l.Id] = l.Lane
		}
	}
	if len(fromA) == 0 {
		t.Fatal("no cross-block lanes in the fixture — the test proves nothing")
	}
	if !reflect.DeepEqual(fromA, fromB) {
		t.Fatalf("cross-block lanes disagree by side: %v vs %v", fromA, fromB)
	}
}

func TestField_LaneHorizonCoversTheBlockWindow(t *testing.T) {
	f := NewField(17, testParams())
	// Pick a real system on a block corner, where the diagonal neighbour matters.
	p := testParams()
	corner := Cell{X: p.BlockSize - 1, Y: p.BlockSize - 1}
	for !f.Survives(corner) {
		corner.X--
		if corner.X < 0 {
			t.Fatal("no surviving system near the block corner")
		}
	}
	horizon := map[Block]bool{}
	for _, b := range f.LaneHorizon(SystemIdFor(corner)) {
		horizon[b] = true
	}
	for _, want := range BlockWindow(f.BlockOf(corner)) {
		if !horizon[want] {
			t.Fatalf("lane horizon missed block %+v (diagonals included — B2)", want)
		}
	}
	// Every incident lane's far endpoint must live inside the horizon.
	for _, l := range f.BlockLanes(f.BlockOf(corner)) {
		if l.AId != SystemIdFor(corner) && l.BId != SystemIdFor(corner) {
			continue
		}
		if !horizon[l.FarBlock(f.BlockOf(corner))] {
			t.Fatalf("lane %s reaches outside the ensured horizon", l.Id)
		}
	}
}

// --- Bridges ----------------------------------------------------------------

// voidParams tunes the field into a sparse, void-riddled world so the bridge
// mechanism is exercised. The production defaults are deliberately supercritical
// (no empty blocks at all — see DefaultParams), which is exactly why bridges need
// their own fixture rather than a lucky seed.
func voidParams() GenerationParams {
	p := DefaultParams()
	// A lane cap barely above one cell leaves most neighbours unjoined, and a
	// tiny block makes empty blocks common.
	p.MaxLaneLength = 45
	p.BlockSize = 2
	p.BridgeSearchHorizon = 4
	p.MinGapByRegion = map[string]float64{
		string(RegionStarRich): 30,
		string(RegionNormal):   30,
		string(RegionDead):     30,
		string(RegionBarrier):  30,
	}
	// Push most of the sky into "dead" so survivors are scarce and blocks empty
	// out: with the gap at the cell size, roughly half of all candidates die.
	p.HalfHeightZ = 4
	return p
}

func TestField_BridgeConstruction(t *testing.T) {
	p := voidParams()
	if err := p.Validate(); err != nil {
		t.Fatalf("void fixture params invalid: %v", err)
	}
	f := NewField(3, p)

	found := 0
	for bx := -8; bx <= 8; bx++ {
		for by := -8; by <= 8; by++ {
			b := Block{X: bx, Y: by}
			bridges := f.bridgesFrom(b)
			if f.BlockEmpty(b) && len(bridges) > 0 {
				t.Fatalf("empty block %+v originated a bridge", b)
			}
			perDir := map[Block]int{}
			for _, l := range bridges {
				far := l.FarBlock(b)
				dir := Block{X: sign(far.X - b.X), Y: sign(far.Y - b.Y)}
				perDir[dir]++
				if perDir[dir] > 1 {
					t.Fatalf("block %+v originated %d bridges in direction %+v (max 1)", b, perDir[dir], dir)
				}
				if dir.X < 0 || dir.Y < 0 {
					t.Fatalf("bridge from %+v runs in a negative direction %+v", b, dir)
				}
				if f.BlockEmpty(far) {
					t.Fatalf("bridge from %+v targets empty block %+v", b, far)
				}
				if f.ordinaryLaneSpans(b, far) {
					t.Fatalf("bridge added between %+v and %+v where an ordinary lane already spans", b, far)
				}
				if !l.Bridge {
					t.Fatalf("bridge lane %s is not marked bridge", l.Id)
				}
				// Every block strictly between must be empty (skipped over).
				steps := maxInt(absInt(far.X-b.X), absInt(far.Y-b.Y))
				for k := 1; k < steps; k++ {
					mid := Block{X: b.X + dir.X*k, Y: b.Y + dir.Y*k}
					if !f.BlockEmpty(mid) {
						t.Fatalf("bridge %+v→%+v skipped the non-empty block %+v", b, far, mid)
					}
				}
				if steps > 1 {
					found++
				}
			}
		}
	}
	if found == 0 {
		t.Fatal("the void fixture produced no bridge that skips an empty block — it proves nothing")
	}
}

// A bridge must be visible from BOTH its endpoint blocks, or the far side could
// never materialize it (adversary R2-B1).
func TestField_BridgesAreIncidentFromBothSides(t *testing.T) {
	f := NewField(3, voidParams())
	checked := 0
	for bx := -6; bx <= 6; bx++ {
		for by := -6; by <= 6; by++ {
			b := Block{X: bx, Y: by}
			for _, l := range f.bridgesFrom(b) {
				far := l.FarBlock(b)
				seen := false
				for _, back := range f.BlockBridges(far) {
					if back.Id == l.Id {
						seen = true
					}
				}
				if !seen {
					t.Fatalf("bridge %s is invisible from its far block %+v", l.Id, far)
				}
				// And the far block must be inside the materialization horizon.
				inHorizon := false
				for _, fb := range f.BridgeFarBlocks(far) {
					if fb == b {
						inHorizon = true
					}
				}
				if !inHorizon {
					t.Fatalf("bridge %s far block %+v does not list %+v in its horizon", l.Id, far, b)
				}
				checked++
			}
		}
	}
	if checked == 0 {
		t.Fatal("no bridges in the void fixture")
	}
}

// --- Region statistics ------------------------------------------------------

// The density band is what tuning actually guarantees (D1 is explicit that there
// is NO per-window survivor floor — empty blocks are expected over an infinite
// world). This asserts the shape of the sky at scale: every class populated,
// star-rich never rarer than dead, and barrier the sparsest.
func TestField_RegionStatistics(t *testing.T) {
	p := DefaultParams()
	const half = 30 // a 61×61-cell area — large enough for the noise to average out
	for _, seed := range []int64{1, 7, 42, StartAreaSeed} {
		t.Run(fmt.Sprintf("seed_%d", seed), func(t *testing.T) {
			f := NewField(seed, p)
			counts := map[Region]int{}
			cells := 0
			for x := -half; x <= half; x++ {
				for y := -half; y <= half; y++ {
					cells++
					if f.Survives(Cell{X: x, Y: y}) {
						counts[f.candidateAt(Cell{X: x, Y: y}).region]++
					}
				}
			}
			total := 0
			for _, r := range []Region{RegionStarRich, RegionNormal, RegionDead, RegionBarrier} {
				if counts[r] == 0 {
					t.Fatalf("region %s is empty at scale", r)
				}
				total += counts[r]
			}
			// The cell grid caps density at one system per cell; tuning keeps the
			// realized rate in a band well inside that.
			if rate := float64(total) / float64(cells); rate < 0.55 || rate > 0.95 {
				t.Fatalf("survivor rate %.2f outside the tuned band [0.55, 0.95]", rate)
			}
			if counts[RegionStarRich] < counts[RegionDead] {
				t.Fatalf("star-rich (%d) is rarer than dead (%d)", counts[RegionStarRich], counts[RegionDead])
			}
			for _, r := range []Region{RegionStarRich, RegionNormal, RegionDead} {
				if counts[RegionBarrier] > counts[r] {
					t.Fatalf("barrier (%d) is not the sparsest — exceeds %s (%d)", counts[RegionBarrier], r, counts[r])
				}
			}
		})
	}
}

// The origin component must grow with the area available to it — the
// supercritical-connectivity assertion behind D4's finite-origin-pocket risk.
func TestField_LaneConnectivityIsSupercritical(t *testing.T) {
	p := DefaultParams()
	f := NewField(StartAreaSeed, p)

	const half = 12
	cells := map[Cell]bool{}
	for x := -half; x <= half; x++ {
		for y := -half; y <= half; y++ {
			c := Cell{X: x, Y: y}
			if f.Survives(c) {
				cells[c] = true
			}
		}
	}
	adj := map[Cell][]Cell{}
	list := make([]Cell, 0, len(cells))
	for c := range cells {
		list = append(list, c)
	}
	for i := range list {
		for j := i + 1; j < len(list); j++ {
			if f.ordinaryLane(f.candidateAt(list[i]), f.candidateAt(list[j])) {
				adj[list[i]] = append(adj[list[i]], list[j])
				adj[list[j]] = append(adj[list[j]], list[i])
			}
		}
	}
	seen := map[Cell]bool{}
	largest := 0
	for c := range cells {
		if seen[c] {
			continue
		}
		n := 0
		queue := []Cell{c}
		seen[c] = true
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			n++
			for _, nb := range adj[cur] {
				if !seen[nb] {
					seen[nb] = true
					queue = append(queue, nb)
				}
			}
		}
		if n > largest {
			largest = n
		}
	}
	if share := float64(largest) / float64(len(cells)); share < 0.9 {
		t.Fatalf("largest lane component holds %.0f%% of %d systems — connectivity is near-critical, "+
			"which resurrects the finite-origin-pocket risk", share*100, len(cells))
	}
}

func sign(a int) int {
	switch {
	case a > 0:
		return 1
	case a < 0:
		return -1
	}
	return 0
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
