package galaxy

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

// The field is the platonic infinite galaxy: every system that will ever exist
// is a pure function of (seed, params) over unbounded space. Nothing here
// touches storage or the clock. Persistence materializes a subset of this — it
// never invents anything, it discovers.
//
// The three locality guarantees everything above this file rests on:
//
//	placement — a cell's candidate survives or dies against its 3×3 cell window
//	            alone (cellSize is the largest region gap, so no conflict can
//	            reach further)
//	lanes     — an ordinary lane is decided against the field candidates within
//	            MaxLaneLength of the pair, and BlockSize·cellSize > MaxLaneLength
//	            keeps every ordinary lane inside a block's 3×3 block window
//	bridges   — a block bridges only along +x/+y, only to the nearest non-empty
//	            block within BridgeSearchHorizon

// Cell is a coordinate in the field's unbounded cell grid. It is a system's
// stable field identity: the id is the coordinate pair, so a system's name,
// skeleton, and lanes are the same no matter when or by whom it materializes.
type Cell struct{ X, Y int }

// Block is a BlockSize × BlockSize tile of cells — the materialization atom.
type Block struct{ X, Y int }

// CellRect is an inclusive rectangle of cells.
type CellRect struct{ MinX, MinY, MaxX, MaxY int }

// SystemIdFor is the one derivation of a system's document id from its field
// identity (D2). Nothing downstream parses it except CellForSystemId.
func SystemIdFor(c Cell) string {
	return fmt.Sprintf("sys_%d_%d", c.X, c.Y)
}

// CellForSystemId recovers a system's field cell from its id — how a consumer
// holding only an id (the scan seam, the spawn walk) finds the blocks to
// materialize.
func CellForSystemId(id string) (Cell, bool) {
	rest, ok := strings.CutPrefix(id, "sys_")
	if !ok {
		return Cell{}, false
	}
	// The Y coordinate may be negative, so split on the LAST separator that
	// starts a signed integer rather than on every underscore.
	i := strings.LastIndex(rest, "_")
	if i <= 0 || i == len(rest)-1 {
		return Cell{}, false
	}
	x, err := strconv.Atoi(rest[:i])
	if err != nil {
		return Cell{}, false
	}
	y, err := strconv.Atoi(rest[i+1:])
	if err != nil {
		return Cell{}, false
	}
	return Cell{X: x, Y: y}, true
}

// BlockIdFor is a block anchor's document id.
func BlockIdFor(b Block) string { return fmt.Sprintf("%d_%d", b.X, b.Y) }

// laneIdFor derives a lane's document id from the unordered pair of endpoint
// cells (D2), so a lane computed from either side of a block boundary — or
// concurrently from both — is the same document.
func laneIdFor(a, b Cell) string {
	if !cellLess(a, b) {
		a, b = b, a
	}
	return fmt.Sprintf("lane_%d_%d_%d_%d", a.X, a.Y, b.X, b.Y)
}

func cellLess(a, b Cell) bool {
	if a.X != b.X {
		return a.X < b.X
	}
	return a.Y < b.Y
}

// LaneIdBetween derives a lane's document id from the unordered pair of
// endpoint SYSTEM ids, purely (no read) — exported over the existing
// laneIdFor/CellForSystemId pair (replace-observation-with-sightings
// design.md Decision 3, tasks.md 2.1) so a gate-attachment knowledge write
// can derive its lane id without reading the destination system. An
// unparseable system id yields the zero Cell, matching CellForSystemId's own
// permissive-decode convention elsewhere in this package.
func LaneIdBetween(aSysId, bSysId string) string {
	a, _ := CellForSystemId(aSysId)
	b, _ := CellForSystemId(bSysId)
	return laneIdFor(a, b)
}

// --- Deterministic hashing --------------------------------------------------

// cellHash is the per-cell entropy source: a pure function of (seed, cx, cy).
// Every derived value (jitter, priority, tie-breaks) is a salted re-mix of it,
// so each draw is an independent, reproducible stream.
func cellHash(seed int64, c Cell) uint64 {
	h := uint64(seed)*0x9E3779B97F4A7C15 ^
		uint64(int64(c.X))*0xC2B2AE3D27D4EB4F ^
		uint64(int64(c.Y))*0x165667B19E3779F9
	return splitmix(h)
}

func splitmix(h uint64) uint64 {
	h ^= h >> 30
	h *= 0xBF58476D1CE4E5B9
	h ^= h >> 27
	h *= 0x94D049BB133111EB
	h ^= h >> 31
	return h
}

func mix(h, salt uint64) uint64 { return splitmix(h + salt*0x9E3779B97F4A7C15) }

// unitFloat maps a hash to [0,1) with the top 53 bits — the same construction
// math/rand's Float64 uses, so jitter is uniform.
func unitFloat(h uint64) float64 { return float64(h>>11) / float64(uint64(1)<<53) }

// zSlabSteps is how many discrete positions the Z draw resolves per half-slab.
// Fine enough to read as continuous, coarse enough to be exactly representable.
const zSlabSteps int64 = 1 << 20

// --- The field --------------------------------------------------------------

// candidate is one cell's deterministic star candidate, before the survival
// rule runs.
type candidate struct {
	cell     Cell
	coords   Coords
	region   Region
	priority uint64
}

// Field is the pure infinite star field for one (seed, params) pair. It memoizes
// candidate derivation (the noise evaluation dominates), so it is NOT safe for
// concurrent use — construct one per operation; construction is cheap.
type Field struct {
	seed     int64
	params   GenerationParams
	noise    *fractalNoise
	cellSize float64
	// laneReach is how many cells away a lane partner or blocker can sit. Two
	// candidates whose cells are k apart are at least (k-1)·cellSize apart, so
	// anything within MaxLaneLength lies inside this Chebyshev radius.
	laneReach int

	// zUnitStep is the slab's discrete Z quantum: HalfHeightZ / zSlabSteps,
	// divided once here so the per-candidate draw is a single multiply.
	zUnitStep float64

	cands    map[Cell]candidate
	survived map[Cell]bool
}

// NewField builds the field for a seed and params. Params are assumed valid
// (Validate runs at seeding and service construction).
func NewField(seed int64, params GenerationParams) *Field {
	cs := params.CellSize()
	return &Field{
		seed:      seed,
		params:    params,
		noise:     newFractalNoise(seed, params),
		cellSize:  cs,
		laneReach: int(math.Ceil(params.MaxLaneLength/cs)) + 1,
		zUnitStep: params.HalfHeightZ / float64(zSlabSteps),
		cands:     map[Cell]candidate{},
		survived:  map[Cell]bool{},
	}
}

// Seed and Params expose what the field was built from, for callers that hold
// only the field.
func (f *Field) Seed() int64              { return f.seed }
func (f *Field) Params() GenerationParams { return f.params }
func (f *Field) BlockOf(c Cell) Block {
	return Block{X: floorDiv(c.X, f.params.BlockSize), Y: floorDiv(c.Y, f.params.BlockSize)}
}
func (f *Field) BlockRect(b Block) CellRect {
	n := f.params.BlockSize
	return CellRect{MinX: b.X * n, MinY: b.Y * n, MaxX: b.X*n + n - 1, MaxY: b.Y*n + n - 1}
}

// floorDiv is integer division that rounds toward negative infinity, so block
// coordinates stay contiguous across the origin.
func floorDiv(a, b int) int {
	q := a / b
	if (a%b != 0) && ((a < 0) != (b < 0)) {
		q--
	}
	return q
}

// candidateAt derives a cell's single candidate: jittered position within the
// cell (Z jittered through the slab), a deterministic priority, and the region
// classified from the coordinate-pure fractal noise at that position (D1).
func (f *Field) candidateAt(c Cell) candidate {
	if got, ok := f.cands[c]; ok {
		return got
	}
	h := cellHash(f.seed, c)
	// Every product below is wrapped in an explicit float64(...) so the compiler
	// cannot fuse it into an FMA. The field must be IDENTICAL wherever a block
	// materializes — and since the endless galaxy materializes lazily, "wherever"
	// now spans hosts and build targets over the life of a world, not one seed
	// run on one machine. A single fused low bit here can flip a survival test or
	// a lane, i.e. change the world.
	// Each product is materialized through an explicit float64(...) before it
	// meets an add, so no expression can fuse into an FMA.
	cellX := float64(float64(c.X) * f.cellSize)
	cellY := float64(float64(c.Y) * f.cellSize)
	// Z is drawn DISCRETELY: an exact integer step count within the slab, scaled
	// once. A discretized draw is the determinism seam's preferred shape — there
	// is no float chain left for a multiply-add to fuse, so the slab coordinate
	// is bit-identical on every build target by construction rather than by
	// pragma.
	zStep := int64(mix(h, 3)%uint64(2*zSlabSteps+1)) - zSlabSteps
	coords := Coords{
		X: cellX + float64(unitFloat(mix(h, 1))*f.cellSize),
		Y: cellY + float64(unitFloat(mix(h, 2))*f.cellSize),
		Z: float64(zStep) * f.zUnitStep,
	}
	cand := candidate{
		cell:     c,
		coords:   coords,
		region:   classify(f.noise.at(coords.X, coords.Y, coords.Z), f.params),
		priority: mix(h, 4),
	}
	f.cands[c] = cand
	return cand
}

// stronger is the total order the survival rule kills by: higher priority wins,
// with the cell coordinates breaking a hash tie. Total and antisymmetric, so
// "survives iff no stronger conflict" can never kill both sides of a pair.
func stronger(a, b candidate) bool {
	if a.priority != b.priority {
		return a.priority > b.priority
	}
	return cellLess(b.cell, a.cell)
}

// Survives is the biconditional placement rule (D1): a candidate lives iff no
// STRONGER candidate lies closer than the larger of the two candidates' region
// gaps. Conflicts cannot reach past the 3×3 cell window (cellSize is the largest
// gap), so this is computable identically from anywhere in the world — which is
// what makes materialization order-independent.
//
// Deliberately NOT true iterative Poisson (die only to a SURVIVING neighbour):
// that recurses along priority chains of unbounded depth, so a cell's answer
// could depend on arbitrarily distant cells. The cost is sparser packing.
func (f *Field) Survives(c Cell) bool {
	if got, ok := f.survived[c]; ok {
		return got
	}
	cand := f.candidateAt(c)
	live := true
	for dx := -1; dx <= 1 && live; dx++ {
		for dy := -1; dy <= 1; dy++ {
			if dx == 0 && dy == 0 {
				continue
			}
			other := f.candidateAt(Cell{X: c.X + dx, Y: c.Y + dy})
			required := math.Max(f.gap(cand.region), f.gap(other.region))
			if dist(cand.coords, other.coords) < required && stronger(other, cand) {
				live = false
				break
			}
		}
	}
	f.survived[c] = live
	return live
}

func (f *Field) gap(r Region) float64 { return f.params.MinGapByRegion[string(r)] }

// survivorsIn returns the surviving candidates in a cell rect, in a stable
// cell order.
func (f *Field) survivorsIn(r CellRect) []candidate {
	var out []candidate
	for x := r.MinX; x <= r.MaxX; x++ {
		for y := r.MinY; y <= r.MaxY; y++ {
			c := Cell{X: x, Y: y}
			if f.Survives(c) {
				out = append(out, f.candidateAt(c))
			}
		}
	}
	return out
}

// SystemAt returns the system at a cell, or nil when nothing survives there.
func (f *Field) SystemAt(c Cell) *System {
	if !f.Survives(c) {
		return nil
	}
	s := f.systemOf(f.candidateAt(c))
	return &s
}

func (f *Field) systemOf(c candidate) System {
	id := SystemIdFor(c.cell)
	return System{
		Id:       id,
		Coords:   c.coords,
		Name:     systemName(f.seed, c.cell),
		Region:   c.region,
		Skeleton: rollSkeleton(SystemSeed(f.seed, id), c.region, f.params),
	}
}

// Systems materializes every surviving system in a cell rect. The pure window
// query the block materializer and the start-area asset both build on.
func (f *Field) Systems(r CellRect) []System {
	cands := f.survivorsIn(r)
	out := make([]System, 0, len(cands))
	for _, c := range cands {
		out = append(out, f.systemOf(c))
	}
	return out
}

// BlockSystems is Systems over one block's cells.
func (f *Field) BlockSystems(b Block) []System { return f.Systems(f.BlockRect(b)) }

// BlockEmpty reports whether a block holds no surviving candidate. Emptiness is
// a property of the FIELD, never of what has been persisted — bridge geometry
// depends on it, so it must not drift with materialization history.
func (f *Field) BlockEmpty(b Block) bool {
	r := f.BlockRect(b)
	for x := r.MinX; x <= r.MaxX; x++ {
		for y := r.MinY; y <= r.MaxY; y++ {
			if f.Survives(Cell{X: x, Y: y}) {
				return false
			}
		}
	}
	return true
}

// --- Lanes ------------------------------------------------------------------

// FieldLane is a lane plus the blocks its endpoints live in — what block
// materialization needs to decide whether the far side is persisted yet.
type FieldLane struct {
	Lane
	ABlock Block
	BBlock Block
}

// FarBlock returns the block of the endpoint outside `b` (b itself when the
// lane is internal to it).
func (l FieldLane) FarBlock(b Block) Block {
	if l.ABlock == b {
		return l.BBlock
	}
	return l.ABlock
}

// ordinaryLane reports whether the relative-neighbourhood rule keeps the edge
// (a, b), evaluated LOCALLY (D3): within the length cap, and with no surviving
// third candidate in either endpoint's lune. Every possible blocker lies within
// MaxLaneLength of both endpoints, so the window is bounded and the answer is
// the same computed from either side — which is why later materialization can
// never contradict an already-persisted lane.
func (f *Field) ordinaryLane(a, b candidate) bool {
	d := dist(a.coords, b.coords)
	if d > f.params.MaxLaneLength || a.cell == b.cell {
		return false
	}
	for x := a.cell.X - f.laneReach; x <= a.cell.X+f.laneReach; x++ {
		for y := a.cell.Y - f.laneReach; y <= a.cell.Y+f.laneReach; y++ {
			c := Cell{X: x, Y: y}
			if c == a.cell || c == b.cell || !f.Survives(c) {
				continue
			}
			other := f.candidateAt(c)
			if dist(a.coords, other.coords) < d && dist(b.coords, other.coords) < d {
				return false
			}
		}
	}
	return true
}

func (f *Field) laneOf(a, b candidate, bridge bool) FieldLane {
	x, y := a, b
	if !cellLess(x.cell, y.cell) {
		x, y = y, x
	}
	return FieldLane{
		Lane: Lane{
			Id:     laneIdFor(x.cell, y.cell),
			AId:    SystemIdFor(x.cell),
			BId:    SystemIdFor(y.cell),
			Bridge: bridge,
		},
		ABlock: f.BlockOf(x.cell),
		BBlock: f.BlockOf(y.cell),
	}
}

// BlockLanes is every lane with at least one endpoint in the block: the
// ordinary lanes (which can reach no further than the block's 3×3 window, by
// the BlockSize·cellSize > MaxLaneLength invariant) plus every bridge incident
// to the block. Deduplicated and stably ordered.
func (f *Field) BlockLanes(b Block) []FieldLane {
	seen := map[string]bool{}
	var out []FieldLane

	inner := f.survivorsIn(f.BlockRect(b))
	window := f.survivorsIn(f.blockWindowRect(b))
	for _, a := range inner {
		for _, c := range window {
			if a.cell == c.cell || !f.ordinaryLane(a, c) {
				continue
			}
			l := f.laneOf(a, c, false)
			if seen[l.Id] {
				continue
			}
			seen[l.Id] = true
			out = append(out, l)
		}
	}
	for _, l := range f.BlockBridges(b) {
		if seen[l.Id] {
			continue
		}
		seen[l.Id] = true
		out = append(out, l)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Id < out[j].Id })
	return out
}

// blockWindowRect is the 3×3 block window's cell rect — the ordinary-lane
// horizon of a block.
func (f *Field) blockWindowRect(b Block) CellRect {
	n := f.params.BlockSize
	return CellRect{
		MinX: (b.X - 1) * n, MinY: (b.Y - 1) * n,
		MaxX: (b.X+2)*n - 1, MaxY: (b.Y+2)*n - 1,
	}
}

// BlockWindow is the 3×3 block window around b — the blocks an ordinary lane
// out of b can reach, diagonals included.
func BlockWindow(b Block) []Block {
	out := make([]Block, 0, 9)
	for dx := -1; dx <= 1; dx++ {
		for dy := -1; dy <= 1; dy++ {
			out = append(out, Block{X: b.X + dx, Y: b.Y + dy})
		}
	}
	return out
}

// --- Bridges ----------------------------------------------------------------

// bridgeDirs are the two positive cardinal directions a block may originate a
// bridge in. Restricting to +x/+y is what makes "at most one bridge per (block,
// direction)" a global statement rather than a per-side one: the bridge between
// P and Q is originated by exactly one of them.
var bridgeDirs = []Block{{X: 1, Y: 0}, {X: 0, Y: 1}}

// bridgesFrom builds the bridges a non-empty block originates (D4): in each
// positive cardinal direction, the nearest non-empty block within
// BridgeSearchHorizon, skipped over any empty blocks between; one bridge joining
// the closest system pair, and none at all where an ordinary lane already spans
// the two blocks. Bridges may exceed MaxLaneLength — crossing a void is their
// entire job.
func (f *Field) bridgesFrom(p Block) []FieldLane {
	if f.BlockEmpty(p) {
		return nil // an empty block never originates a bridge (no undefined case)
	}
	var out []FieldLane
	for _, d := range bridgeDirs {
		for k := 1; k <= f.params.BridgeSearchHorizon; k++ {
			q := Block{X: p.X + d.X*k, Y: p.Y + d.Y*k}
			if f.BlockEmpty(q) {
				continue // skipped over, never bridged to
			}
			if !f.ordinaryLaneSpans(p, q) {
				if l, ok := f.closestPairBridge(p, q); ok {
					out = append(out, l)
				}
			}
			break // only the NEAREST non-empty block in this direction
		}
	}
	return out
}

// ordinaryLaneSpans reports whether any ordinary lane already joins the two
// blocks. Only adjacent blocks can qualify: further apart, the gap exceeds
// MaxLaneLength by the BlockSize·cellSize invariant.
func (f *Field) ordinaryLaneSpans(p, q Block) bool {
	if absInt(p.X-q.X) > 1 || absInt(p.Y-q.Y) > 1 {
		return false
	}
	for _, a := range f.survivorsIn(f.BlockRect(p)) {
		for _, c := range f.survivorsIn(f.BlockRect(q)) {
			if f.ordinaryLane(a, c) {
				return true
			}
		}
	}
	return false
}

// closestPairBridge joins the closest system pair between two non-empty blocks,
// with the endpoint ids breaking an exact-distance tie deterministically.
func (f *Field) closestPairBridge(p, q Block) (FieldLane, bool) {
	ps := f.survivorsIn(f.BlockRect(p))
	qs := f.survivorsIn(f.BlockRect(q))
	if len(ps) == 0 || len(qs) == 0 {
		return FieldLane{}, false
	}
	best := math.MaxFloat64
	var bestA, bestB candidate
	found := false
	for _, a := range ps {
		for _, c := range qs {
			d := dist(a.coords, c.coords)
			if !found || d < best || (d == best && laneIdFor(a.cell, c.cell) < laneIdFor(bestA.cell, bestB.cell)) {
				best, bestA, bestB, found = d, a, c, true
			}
		}
	}
	if !found {
		return FieldLane{}, false
	}
	return f.laneOf(bestA, bestB, true), true
}

// BlockBridges is every bridge incident to a block: the ones it originates
// (+x/+y) and the ones that land on it from -x/-y. A bridge lands on b from a
// direction only if b is the NEAREST non-empty block that way, so at most one
// origin per axis needs checking.
func (f *Field) BlockBridges(b Block) []FieldLane {
	out := f.bridgesFrom(b)
	if f.BlockEmpty(b) {
		return out
	}
	for _, d := range bridgeDirs {
		for k := 1; k <= f.params.BridgeSearchHorizon; k++ {
			p := Block{X: b.X - d.X*k, Y: b.Y - d.Y*k}
			if f.BlockEmpty(p) {
				continue
			}
			for _, l := range f.bridgesFrom(p) {
				if l.ABlock == b || l.BBlock == b {
					out = append(out, l)
				}
			}
			break // only the nearest non-empty origin can reach b from this side
		}
	}
	return out
}

// BridgeFarBlocks is the set of blocks on the far side of a bridge incident to
// b — the part of a block's materialization horizon that the 3×3 window misses
// (a bridge exists precisely because the blocks between are empty).
func (f *Field) BridgeFarBlocks(b Block) []Block {
	var out []Block
	seen := map[Block]bool{}
	for _, l := range f.BlockBridges(b) {
		far := l.FarBlock(b)
		if far == b || seen[far] {
			continue
		}
		seen[far] = true
		out = append(out, far)
	}
	return out
}

// LaneHorizon is the set of blocks a materialization trigger must ensure before
// a system's incident lanes are complete (D5): its block's 3×3 window, plus the
// far-endpoint block of every bridge incident to that system. Returns nothing
// for an id that is not a field coordinate.
func (f *Field) LaneHorizon(systemID string) []Block {
	cell, ok := CellForSystemId(systemID)
	if !ok {
		return nil
	}
	home := f.BlockOf(cell)
	out := BlockWindow(home)
	seen := map[Block]bool{}
	for _, b := range out {
		seen[b] = true
	}
	sysID := SystemIdFor(cell)
	for _, l := range f.BlockBridges(home) {
		if l.AId != sysID && l.BId != sysID {
			continue
		}
		far := l.FarBlock(home)
		if seen[far] {
			continue
		}
		seen[far] = true
		out = append(out, far)
	}
	return out
}

// --- Geometry helpers -------------------------------------------------------

func absInt(a int) int {
	if a < 0 {
		return -a
	}
	return a
}

// dist is the field's one distance function — the input to placement survival,
// the lane cap, the relative-neighbourhood test, and bridge pair selection. The
// squares are wrapped so the sum cannot contract into an FMA (a cross-target
// divergence hazard); math.Sqrt itself is IEEE correctly-rounded and therefore
// target-stable, but it is registered rather than pragma'd because it shares the
// galaxy-generation architecture-divergence defect with the noise field, whose
// third-party internals are out of reach.
func dist(a, b Coords) float64 {
	dx, dy, dz := a.X-b.X, a.Y-b.Y, a.Z-b.Z
	return math.Sqrt(float64(dx*dx) + float64(dy*dy) + float64(dz*dz))
}

// boundsOfSystems is the axis-aligned extent of a system set. Empty ⇒ the zero
// bounds, which the monotonic merge treats as "contributes nothing".
func boundsOfSystems(systems []System) (Bounds, bool) {
	if len(systems) == 0 {
		return Bounds{}, false
	}
	c := systems[0].Coords
	b := Bounds{X: [2]float64{c.X, c.X}, Y: [2]float64{c.Y, c.Y}, Z: [2]float64{c.Z, c.Z}}
	for _, s := range systems[1:] {
		b = b.Expand(s.Coords)
	}
	return b, true
}

// BlockOfSystem resolves a system id's block under a params value — the mapping
// consumers outside this package (the spawn walk's depth measure) need without
// building a whole Field.
func BlockOfSystem(systemID string, p GenerationParams) (Block, bool) {
	c, ok := CellForSystemId(systemID)
	if !ok {
		return Block{}, false
	}
	return Block{X: floorDiv(c.X, p.BlockSize), Y: floorDiv(c.Y, p.BlockSize)}, true
}
