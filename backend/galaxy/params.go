package galaxy

import (
	"errors"
	"fmt"
)

// MaxTransactionWrites is the storage transaction's write ceiling. A block's
// worst-case document count must fit inside one transaction, because a block
// materializes atomically or not at all (the endless-galaxy materialization
// atom).
const MaxTransactionWrites = 500

// maxLaneDegreeBound is the conservative per-system incident-lane bound used by
// the worst-case block write estimate. The relative-neighbourhood graph in a
// thin 3D slab never approaches it (observed degrees run 3–6), so it is a safe
// ceiling rather than a measured value.
const maxLaneDegreeBound = 8

// GenerationParams holds every knob the generator turns — the field's cell
// grid, noise shape, per-region spacing, lane reach, and skeleton
// distributions. There is no world size: the field is unbounded and the
// persisted galaxy is the materialized subset of it. Tuning is data (a
// cross-cutting rule): a galaxy stores the exact params it was seeded with, so
// every later materialization derives the SAME field.
type GenerationParams struct {
	// --- Slab geometry (broad x/y, thin z) ---
	HalfHeightZ float64 `json:"halfHeightZ" firestore:"halfHeightZ"`

	// --- Placement ---
	// MinGapByRegion is the minimum spacing (in coord units) around a node of
	// each region, keyed by Region string. Tight in star_rich, sparse in
	// dead/barrier — the *contrast* is what makes clusters read as clusters
	// (#0001 Decision #7). Keyed by plain string (not Region) because Firestore
	// only serializes string-keyed maps. The LARGEST gap is the field's cell
	// size, which is what confines every placement conflict to a 3×3 cell
	// window and makes placement local.
	MinGapByRegion map[string]float64 `json:"minGapByRegion" firestore:"minGapByRegion"`

	// --- Field structure (the endless galaxy) ---
	// MaxLaneLength caps an ordinary lane's length. Longer pairs are not joined:
	// voids wider than this are real, which is what turns dead space and barrier
	// bands into the choke geography the original design wanted.
	MaxLaneLength float64 `json:"maxLaneLength" firestore:"maxLaneLength"`
	// BlockSize is the side, in cells, of the materialization atom. It must
	// satisfy BlockSize·cellSize > MaxLaneLength (STRICTLY), so an ordinary lane
	// can never span past a block's 3×3 neighbourhood.
	BlockSize int `json:"blockSize" firestore:"blockSize"`
	// BridgeSearchHorizon is how many blocks a bridge may reach along a cardinal
	// axis when stitching across a void.
	BridgeSearchHorizon int `json:"bridgeSearchHorizon" firestore:"bridgeSearchHorizon"`
	// StartAreaBlockRadius is the block radius around the origin block that
	// seeding materializes up front — the world every new galaxy starts with.
	StartAreaBlockRadius int `json:"startAreaBlockRadius" firestore:"startAreaBlockRadius"`
	// MinOriginComponentSystems is the seed-time floor on the origin system's
	// lane component within the start area. A seed below it is rejected before
	// going live (the origin-pocket rail).
	MinOriginComponentSystems int `json:"minOriginComponentSystems" firestore:"minOriginComponentSystems"`

	// --- Noise field / region classification ---
	NoiseFrequency float64 `json:"noiseFrequency" firestore:"noiseFrequency"`
	NoiseOctaves   int     `json:"noiseOctaves" firestore:"noiseOctaves"`
	// StarRichThreshold / DeadThreshold cut the [-1,1] fractal noise value into
	// regions; BarrierBand is the half-width of the zero-crossing seam that
	// becomes a barrier (naturally thin, spanning between clusters and voids).
	StarRichThreshold float64 `json:"starRichThreshold" firestore:"starRichThreshold"`
	DeadThreshold     float64 `json:"deadThreshold" firestore:"deadThreshold"`
	BarrierBand       float64 `json:"barrierBand" firestore:"barrierBand"`

	// --- Skeleton distributions ---
	// StarClassWeights biases the star-class roll (O rarest → M commonest).
	StarClassWeights map[string]int `json:"starClassWeights" firestore:"starClassWeights"`
	MinBodies        int            `json:"minBodies" firestore:"minBodies"`
	MaxBodies        int            `json:"maxBodies" firestore:"maxBodies"`
	MaxRings         int            `json:"maxRings" firestore:"maxRings"`
}

// ErrInvalidParams is the sentinel every params-validation failure wraps, so
// seeding and service construction can be told apart from storage errors.
var ErrInvalidParams = errors.New("invalid generation params")

// CellSize is the side of one field cell: the largest region gap. Sizing the
// grid this way is what confines a placement conflict to the 3×3 cell window
// (two candidates two cells apart are at least one cell size apart, which is at
// least the largest required separation).
func (p GenerationParams) CellSize() float64 {
	m := 1.0
	for _, g := range p.MinGapByRegion {
		if g > m {
			m = g
		}
	}
	return m
}

// WorstCaseBlockWrites is the upper bound on documents one block
// materialization writes: the anchor, the block's systems, their incident
// lanes, and the bridges the block can originate or receive.
func (p GenerationParams) WorstCaseBlockWrites() int {
	cells := p.BlockSize * p.BlockSize
	bridges := 4 * p.BridgeSearchHorizon
	return 1 + cells + cells*maxLaneDegreeBound + bridges
}

// Validate rejects a params value that would break the field's local-computation
// guarantees or overflow one materialization transaction. Called at seed time
// and at service construction — never silently.
func (p GenerationParams) Validate() error {
	if p.MaxLaneLength <= 0 {
		return fmt.Errorf("%w: maxLaneLength must be positive, got %g (a laneless world could never be walked)",
			ErrInvalidParams, p.MaxLaneLength)
	}
	if p.BlockSize < 1 {
		return fmt.Errorf("%w: blockSize must be at least 1, got %d", ErrInvalidParams, p.BlockSize)
	}
	if span := float64(p.BlockSize) * p.CellSize(); span <= p.MaxLaneLength {
		return fmt.Errorf("%w: blockSize·cellSize (%g) must be STRICTLY greater than maxLaneLength (%g), "+
			"or an ordinary lane could span past adjacent blocks and escape the materialization horizon",
			ErrInvalidParams, span, p.MaxLaneLength)
	}
	if p.BridgeSearchHorizon < 1 {
		return fmt.Errorf("%w: bridgeSearchHorizon must be at least 1, got %d", ErrInvalidParams, p.BridgeSearchHorizon)
	}
	if p.MinOriginComponentSystems < 1 {
		return fmt.Errorf("%w: minOriginComponentSystems must be at least 1, got %d",
			ErrInvalidParams, p.MinOriginComponentSystems)
	}
	if w := p.WorstCaseBlockWrites(); w > MaxTransactionWrites {
		return fmt.Errorf("%w: a block's worst-case write count (%d) exceeds the transaction limit (%d) — lower blockSize",
			ErrInvalidParams, w, MaxTransactionWrites)
	}
	return nil
}

// DefaultParams returns the tuned field defaults.
//
// Two tuning facts worth knowing before turning these knobs:
//
//   - Region gaps buy less contrast than they look like they do. The cell size
//     IS the largest gap, so no region can pack denser than one system per cell
//     — a tight star_rich gap raises its SURVIVAL rate, not its ceiling. What
//     actually sets a region's share of the sky is its slice of the noise range.
//     That is why the barrier stays the sparsest class through a narrow
//     BarrierBand rather than through a huge barrier gap (which would only
//     inflate the cell size and flatten everyone).
//   - MaxLaneLength sits comfortably above the typical neighbour separation
//     (≈2.3 cells), keeping the ordinary-lane graph well above its percolation
//     threshold — D4's supercritical-tuning mitigation against a finite origin
//     pocket. Pulling it toward one cell size makes voids common and the origin
//     component fragile.
//
// Callers clone and tweak.
func DefaultParams() GenerationParams {
	return GenerationParams{
		HalfHeightZ: 80,
		MinGapByRegion: map[string]float64{
			string(RegionStarRich): 26,
			string(RegionNormal):   40,
			string(RegionDead):     70,
			string(RegionBarrier):  78,
		},
		MaxLaneLength:             180,
		BlockSize:                 3,
		BridgeSearchHorizon:       3,
		StartAreaBlockRadius:      1,
		MinOriginComponentSystems: 8,
		NoiseFrequency:            0.0016,
		NoiseOctaves:              3,
		StarRichThreshold:         0.26,
		DeadThreshold:             -0.32,
		BarrierBand:               0.015,
		StarClassWeights: map[string]int{
			"O": 1, "B": 3, "A": 8, "F": 14, "G": 20, "K": 26, "M": 34,
		},
		MinBodies: 1,
		MaxBodies: 7,
		MaxRings:  12,
	}
}

// StartAreaSeed is the fixed, known seed for the frozen logged-out start area —
// its own tiny galaxy, cacheable as a static asset, never regenerated at request
// time (#0001 Decision #3).
const StartAreaSeed int64 = 424242

// StartAreaParams is the shape shown to logged-out visitors and seeded into the
// local/e2e world: the origin block's immediate neighbourhood of the same
// infinite field, not a separate closed disc.
func StartAreaParams() GenerationParams {
	p := DefaultParams()
	p.StartAreaBlockRadius = 1
	return p
}
