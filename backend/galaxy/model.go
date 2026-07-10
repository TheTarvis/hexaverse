package galaxy

import "hexaverse/common"

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
	BodyRocky     BodyType = "rocky"
	BodyGasGiant  BodyType = "gas_giant"
	BodyIce       BodyType = "ice"
	BodyMoltenz   BodyType = "molten"
	BodyOceanic   BodyType = "oceanic"
	BodyBarrenz   BodyType = "barren"
)

// Body is one major body in a system's skeleton — the graph-visible inventory
// (#0001 Decision #9), always visible, never fogged. The mutable *detail*
// (resources, small bodies, hazards) is #0003's paid survey, materialized on
// first arrival, and lives elsewhere.
type Body struct {
	Type BodyType `json:"type" firestore:"type"`
	// Ring is the orbital index (0 = innermost). #0003's detail phase extends
	// this into full orbital elements from the same per-system seed.
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
	Id       string   `json:"id" firestore:"id"`
	Coords   Coords   `json:"coords" firestore:"coords"`
	Name     string   `json:"name" firestore:"name"`
	Region   Region   `json:"region" firestore:"region"`
	Skeleton Skeleton `json:"skeleton" firestore:"skeleton"`
}

// Lane is an edge in the galactic graph — topology only. Travel cost is a
// derived value (length-weighted time from endpoint coords), never stored
// (#0001 Decision #6).
type Lane struct {
	Id  string `json:"id" firestore:"id"`
	AId string `json:"aId" firestore:"aId"`
	BId string `json:"bId" firestore:"bId"`
}

// Bounds is the axis-aligned extent of the galaxy, seeding the view's initial
// zoom-to-fit. Each axis is [min, max].
type Bounds struct {
	X [2]float64 `json:"x" firestore:"x"`
	Y [2]float64 `json:"y" firestore:"y"`
	Z [2]float64 `json:"z" firestore:"z"`
}

// Galaxy is the world metadata document. Systems and lanes live in
// subcollections, not embedded (they number in the hundreds/thousands).
type Galaxy struct {
	Id        string            `json:"id" firestore:"id"`
	Seed      int64             `json:"seed" firestore:"seed"`
	Params    GenerationParams  `json:"params" firestore:"params"`
	Bounds    Bounds            `json:"bounds" firestore:"bounds"`
	Version   int               `json:"version" firestore:"version"`
	CreatedAt common.WorldMillis `json:"createdAt" firestore:"createdAt"`
}

// GeneratedGalaxy is the full output of a generation run — metadata plus the
// nodes and edges, held in memory before persistence.
type GeneratedGalaxy struct {
	Galaxy  Galaxy
	Systems []System
	Lanes   []Lane
}
