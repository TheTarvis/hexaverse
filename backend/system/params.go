package system

import "hexaverse/common"

// CharacterDial is the per-region tuning that makes a star_rich interior
// visibly denser and richer than a dead one from the same generator. Per the
// build order, the dial drives detail *richness / hazards* more than raw body
// count, so the free graph-tier skeleton doesn't leak the paid survey appraisal.
type CharacterDial struct {
	ExtraPlanets int     `json:"extraPlanets" firestore:"extraPlanets"` // small/dark bodies beyond the skeleton
	Belts        int     `json:"belts" firestore:"belts"`
	Specials     int     `json:"specials" firestore:"specials"` // anomalies / ruins
	Hazards      int     `json:"hazards" firestore:"hazards"`
	RichnessMult float64 `json:"richnessMult" firestore:"richnessMult"`
}

// GenerationParams holds every interior-generation knob (radius, band
// boundaries, per-character dials, orbital periods). Tuning is data: retuning is
// edit-a-value-and-regenerate, no code changes (#0003 Decision #11).
type GenerationParams struct {
	Radius       int `json:"radius" firestore:"radius"`
	InnerMaxRing int `json:"innerMaxRing" firestore:"innerMaxRing"`
	MidMaxRing   int `json:"midMaxRing" firestore:"midMaxRing"`

	// RetrogradeChance is the probability that a capture-plausible detail
	// feature (extra small body, anomaly, ruin) orbits against the system's
	// dominant direction. Disk-born features (skeleton majors, belts, hazards)
	// always orbit prograde and ignore this knob.
	RetrogradeChance float64 `json:"retrogradeChance" firestore:"retrogradeChance"`

	// Orbital periods are NOT here: they're pacing, not generation, and are read
	// live from common.Tuning().OrbitBasePeriod via PeriodFor (see model.go).

	// ByCharacter is keyed by the #0001 region string (plain string, not a named
	// type — Firestore only serializes string-keyed maps).
	ByCharacter map[string]CharacterDial `json:"byCharacter" firestore:"byCharacter"`
}

// DefaultParams are the spike-baseline knobs: radius ~16, star_rich roomy-dense.
//
// Radius is the one value here that is NOT free to tune in isolation — it's a
// cross-domain invariant (fleet's lane gates sit on this ring; spawn's rim ring is
// one inside it), so it sources from common.Tuning().BoardRadius. The rest are
// generation dials: they bake into an interior at generate time, so retuning them
// only affects systems materialized afterwards.
//
// PROOF-BACKING (openspec add-orbital-system-bodies, design.md Decision 14):
// Radius also backs `galaxy.DefaultParams().MaxRings - 1 <= Radius`
// (TestCalibration_Scenario_NoSkeletonRingExceedsExtentIndex in
// continuous_test.go) — a skeleton major's raw ring can never exceed the
// orbital index SystemInterior.Extent is computed at, which is what keeps
// Extent a genuine upper bound over every star-parented radius. Lowering
// Radius below `galaxy.DefaultParams().MaxRings - 1` reopens that hole
// silently.
func DefaultParams() GenerationParams {
	return GenerationParams{
		Radius:           common.Tuning().BoardRadius,
		InnerMaxRing:     5,
		MidMaxRing:       11,
		RetrogradeChance: 0.1,
		ByCharacter: map[string]CharacterDial{
			"star_rich": {ExtraPlanets: 3, Belts: 2, Specials: 2, Hazards: 2, RichnessMult: 1.0},
			"normal":    {ExtraPlanets: 1, Belts: 1, Specials: 1, Hazards: 1, RichnessMult: 0.65},
			"dead":      {ExtraPlanets: 0, Belts: 1, Specials: 0, Hazards: 0, RichnessMult: 0.3},
			"barrier":   {ExtraPlanets: 0, Belts: 1, Specials: 1, Hazards: 3, RichnessMult: 0.45},
		},
	}
}

// dialFor returns the character dial for a region, defaulting to "normal".
func (p GenerationParams) dialFor(region string) CharacterDial {
	if d, ok := p.ByCharacter[region]; ok {
		return d
	}
	return p.ByCharacter["normal"]
}
