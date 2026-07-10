package galaxy

// GenerationParams holds every knob the generator turns — disk geometry, noise
// shape, per-region spacing, target count, and skeleton distributions. Tuning is
// data (a cross-cutting rule): the spike values below are the defaults, and a
// galaxy stores the exact params it was generated with so a later frontier
// expansion can append deterministically.
type GenerationParams struct {
	// --- Disk geometry (flattened disk: broad x/y, thin z) ---
	RadiusXY    float64 `json:"radiusXY" firestore:"radiusXY"`
	HalfHeightZ float64 `json:"halfHeightZ" firestore:"halfHeightZ"`

	// --- Placement ---
	TargetCount int `json:"targetCount" firestore:"targetCount"`
	// MaxAttemptsPerNode bounds dart-throwing so generation always terminates.
	MaxAttemptsPerNode int `json:"maxAttemptsPerNode" firestore:"maxAttemptsPerNode"`
	// MinGapByRegion is the minimum spacing (in coord units) around a node of
	// each region, keyed by Region string. Tight in star_rich, sparse in
	// dead/barrier — the *contrast* is what makes clusters read as clusters
	// (#0001 Decision #7). Keyed by plain string (not Region) because Firestore
	// only serializes string-keyed maps.
	MinGapByRegion map[string]float64 `json:"minGapByRegion" firestore:"minGapByRegion"`

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

// DefaultParams returns the spike-validated defaults — ~276 nodes / 522 lanes at
// this scale in the prototype. Callers clone and tweak.
func DefaultParams() GenerationParams {
	return GenerationParams{
		RadiusXY:           500,
		HalfHeightZ:        80,
		TargetCount:        320,
		MaxAttemptsPerNode: 40,
		MinGapByRegion: map[string]float64{
			string(RegionStarRich): 26,
			string(RegionNormal):   40,
			string(RegionDead):     70,
			string(RegionBarrier):  60,
		},
		NoiseFrequency:    0.0016,
		NoiseOctaves:      3,
		StarRichThreshold: 0.30,
		DeadThreshold:     -0.30,
		BarrierBand:       0.05,
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

// StartAreaParams is the small, curated mini-galaxy shown to logged-out
// visitors: a legible handful of systems.
func StartAreaParams() GenerationParams {
	p := DefaultParams()
	p.RadiusXY = 180
	p.HalfHeightZ = 40
	p.TargetCount = 28
	return p
}
