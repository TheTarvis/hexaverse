package galaxy

import (
	"math"

	"hexaverse/common"
	"hexaverse/discovery"
)

// Region is a system's noise-driven regional character. star_rich sectors
// cluster tightly with rich detail; dead zones are sparse voids; barriers are
// the thin seams between them that become natural choke points (#0001).
type Region string

const (
	RegionStarRich Region = "star_rich"
	RegionNormal   Region = "normal"
	RegionDead     Region = "dead"
	RegionBarrier  Region = "barrier"
)

// Coords is a system's position in the flattened-disk volume: broad in x/y,
// thin in z. These are true distances — spawn padding and travel cost derive
// from them (#0001 Decision #1).
type Coords struct {
	X float64 `json:"x" firestore:"x"`
	Y float64 `json:"y" firestore:"y"`
	Z float64 `json:"z" firestore:"z"`
}

// BodyType classifies a major body in a system's skeleton.
type BodyType string

const (
	BodyRocky    BodyType = "rocky"
	BodyGasGiant BodyType = "gas_giant"
	BodyIce      BodyType = "ice"
	BodyMoltenz  BodyType = "molten"
	BodyOceanic  BodyType = "oceanic"
	BodyBarrenz  BodyType = "barren"
)

// Body is one major body in a system's skeleton — the graph-visible inventory
// (#0001 Decision #9), always visible, never fogged. The mutable *detail*
// (resources, small bodies, hazards) is #0003's paid survey, materialized on
// first arrival, and lives elsewhere.
type Body struct {
	Type BodyType `json:"type" firestore:"type"`
	// Ring is an ORDINAL orbital position ascending outward (0 = innermost)
	// — never itself a distance (openspec add-orbital-system-bodies,
	// galaxy-generation: "Per-System Body Skeleton"). It is the ordering
	// input a continuous orbital radius (system.ContinuousRadius) derives
	// from; #0003's detail phase and the continuous element set both extend
	// it. (It once also fed a second, discrete placement, which is why the
	// distinction between "an ordinal" and "a position" is stated here at
	// all — that second consumer is gone.)
	Ring int `json:"ring" firestore:"ring"`
	// Mineable is a bootstrap-visibility hint (#0009 site selection). Cheap to
	// carry now to avoid the M9 retrofit the build order flagged.
	Mineable bool `json:"mineable,omitempty" firestore:"mineable,omitempty"`
}

// Skeleton is a system's major-body inventory: star class + major bodies. The
// free astronomical layer — drawn in the #0002 inspector, rolled eagerly here
// from a per-system seed so #0003's detail phase can extend it consistently.
type Skeleton struct {
	StarClass string `json:"starClass" firestore:"starClass"`
	Bodies    []Body `json:"bodies" firestore:"bodies"`
}

// System is a node in the galactic graph.
type System struct {
	CatalogueRef  string            `json:"catalogueRef" firestore:"-"`
	Discovery     *discovery.Record `json:"discovery,omitempty" firestore:"-"`
	Id            string            `json:"id" firestore:"id"`
	Coords        Coords            `json:"coords" firestore:"coords"`
	Name          string            `json:"name" firestore:"name"`
	GeneratedName string            `json:"generatedName" firestore:"generatedName"`
	Region        Region            `json:"region" firestore:"region"`
	Skeleton      Skeleton          `json:"skeleton" firestore:"skeleton"`
}

// Lane is an edge in the galactic graph — topology only. Travel cost is a
// derived value (length-weighted time from endpoint coords), never stored
// (#0001 Decision #6). The id derives from the unordered pair of endpoint
// system ids, so a lane computed from either side of a block boundary is the
// same document.
type Lane struct {
	Id  string `json:"id" firestore:"id"`
	AId string `json:"aId" firestore:"aId"`
	BId string `json:"bId" firestore:"bId"`
	// Bridge marks a deterministic void-crossing stitch rather than an ordinary
	// relative-neighbourhood road: it may exceed MaxLaneLength, and the galaxy
	// view renders it distinctly. Mechanically it is an ordinary lane.
	Bridge bool `json:"bridge,omitempty" firestore:"bridge,omitempty"`
}

// Bounds is the axis-aligned extent of the MATERIALIZED galaxy, seeding the
// view's initial zoom-to-fit and sizing its reference grid. Each axis is
// [min, max]. It grows monotonically as blocks materialize — descriptive of what
// exists in storage, never a generation parameter (the field itself is
// unbounded).
type Bounds struct {
	X [2]float64 `json:"x" firestore:"x"`
	Y [2]float64 `json:"y" firestore:"y"`
	Z [2]float64 `json:"z" firestore:"z"`
}

// Expand returns the bounds grown to contain a point.
func (b Bounds) Expand(c Coords) Bounds {
	return Bounds{
		X: [2]float64{math.Min(b.X[0], c.X), math.Max(b.X[1], c.X)},
		Y: [2]float64{math.Min(b.Y[0], c.Y), math.Max(b.Y[1], c.Y)},
		Z: [2]float64{math.Min(b.Z[0], c.Z), math.Max(b.Z[1], c.Z)},
	}
}

// Union returns the smallest bounds containing both. The zero value is treated
// as "empty" so an empty block contributes nothing to the materialized extent.
func (b Bounds) Union(o Bounds) Bounds {
	if b == (Bounds{}) {
		return o
	}
	if o == (Bounds{}) {
		return b
	}
	return Bounds{
		X: [2]float64{math.Min(b.X[0], o.X[0]), math.Max(b.X[1], o.X[1])},
		Y: [2]float64{math.Min(b.Y[0], o.Y[0]), math.Max(b.Y[1], o.Y[1])},
		Z: [2]float64{math.Min(b.Z[0], o.Z[0]), math.Max(b.Z[1], o.Z[1])},
	}
}

// Galaxy is the world metadata document. Systems and lanes live in
// subcollections that GROW: the persisted galaxy is the materialized subset of
// the infinite field, and blocks/{bx}_{by} anchors record which tiles of it
// exist.
type Galaxy struct {
	Id        string             `json:"id" firestore:"id"`
	Seed      int64              `json:"seed" firestore:"seed"`
	Params    GenerationParams   `json:"params" firestore:"params"`
	Bounds    Bounds             `json:"bounds" firestore:"bounds"`
	Version   int                `json:"version" firestore:"version"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
	// OriginSystemId is the start area's origin system, chosen and validated at
	// seed time and RECORDED here (D4). Runtime consumers — the first
	// corporation's spawn walk — read it rather than re-deriving it, so a later
	// StartAreaBlockRadius change cannot silently move the world's anchor.
	OriginSystemId string `json:"originSystemId" firestore:"originSystemId"`
	// BlockCount is the number of materialized blocks — the observability
	// counter on unbounded growth, maintained by the same monotonic merge that
	// grows Bounds.
	BlockCount int `json:"blockCount" firestore:"blockCount"`
}

// GeneratedGalaxy is a materialized slice of the world held in memory —
// metadata plus the nodes and edges. It is what GetLive returns and what the
// frozen start-area asset is built from; it is NOT "the galaxy" (the field is
// unbounded).
type GeneratedGalaxy struct {
	Galaxy  Galaxy
	Systems []System
	Lanes   []Lane
}
