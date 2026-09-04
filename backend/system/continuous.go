package system

// The pure continuous-element laws (openspec add-orbital-system-bodies,
// design.md Decisions 1-4, 11, 16, 17). Every multiply here is
// float64(...)-guarded per the parent design's determinism rule
// (check-fma-contraction.sh builds this whole module on both targets;
// `system` is already in check-transcendental.sh's RULE_BEARING_GO_PACKAGES),
// and the one transcendental call (math.Sqrt in keplerPeriodMs) carries a
// `determinism:allow(pinned)` pragma, mirroring space/park.go:177 — it is
// correctly-rounded and identical across Go build targets, so no other
// build-target divergence risk attaches to it.

import (
	"fmt"
	"math"
	"math/rand"

	"hexaverse/common"
	"hexaverse/space"
)

// continuousSeed derives the second RNG stream's seed from the per-system
// seed via a salted splitmix64 finalizer, distinct from
// DominantOrbitDirection's and stations.mix64's own entry constants
// (design.md Decision 11). Sharing the generator's own lattice stream would
// couple every lattice placement to continuous-draw ORDER; this keeps the
// two streams independent so inserting or removing a continuous draw can
// never perturb the lattice board.
func continuousSeed(systemSeed int64) int64 {
	x := uint64(systemSeed) ^ continuousStreamSalt
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return int64(x ^ (x >> 31))
}

// mix64 is the splitmix64 finalizer, a fresh instance in this package
// (design.md Decision 11's implementer note records three such instances —
// system's own, stations.mix64, and DominantOrbitDirection's — as
// acceptable duplication rather than a shared helper, since each existing
// one's constant is load-bearing for already-generated data).
func mix64(x uint64) uint64 {
	x += 0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return x ^ (x >> 31)
}

// fnv1a64 hashes a string to a uint64 via the FNV-1a algorithm — pure
// integer arithmetic (wrapping multiplication is exact and reproducible on
// every build target), used to seed belt-member derivation from a feature
// id string (design.md Decision 5).
func fnv1a64(s string) uint64 {
	const offset64 = 14695981039346656037
	const prime64 = 1099511628211
	h := uint64(offset64)
	for i := 0; i < len(s); i++ {
		h ^= uint64(s[i])
		h *= prime64
	}
	return h
}

// unitFraction maps a generator word onto [0,1) by the pinned exact form
// float64(u >> 11) * 0x1p-53 (the same mapping design.md Decision 13 pins
// for every randomized fixture sweep in this change) — a power-of-two
// scale, so the product is exact and no rounding mode can reach it.
func unitFraction(u uint64) float64 {
	return float64(float64(u>>11) * 0x1p-53)
}

// ContinuousRadius is the geometric law over a per-family orbital index
// (design.md Decision 2): BaseOrbitRadius * RadiusGrowth^idx, evaluated as
// idx explicit float64(...)-guarded multiplies — a fixed trip count bounded
// by the caller's own domain (params.Radius in production; an exhaustive
// [0,64] fixture sweep). The index is NEVER the clamped lattice ring: it is
// the raw, un-clamped skeleton ring for a skeleton major body, or the
// feature's own already-drawn lattice ring for every other star-parented
// feature. Never called for a body-parented feature (moon, station).
func ContinuousRadius(idx int) float64 {
	r := BaseOrbitRadius
	for i := 0; i < idx; i++ {
		r = float64(r * RadiusGrowth)
	}
	return r
}

// keplerPeriodMs is the star-parented orbital period law (design.md
// Decision 3): keplerSeconds(r) = KeplerBaseSeconds * (r/KeplerBaseRadius) *
// sqrt(r/KeplerBaseRadius) — algebraically the PoC's `40*(r/40)^1.5` with
// math.Pow eliminated, leaving exactly one math.Sqrt call. Quantized by
// math.Ceil (never math.Round — Go/JS round-half differently) to an integer
// millisecond count, clamped to a minimum of 1ms so the result is always
// strictly positive: a non-positive period means MOTIONLESS (Decision 1),
// and a star-parented body must never accidentally acquire it.
func keplerPeriodMs(radius float64) common.WorldMillis {
	// tasks.md 9.7 (migrate-fleet-to-continuous-burns): reject a non-finite
	// or negative radius before it reaches math.Sqrt — a negative ratio
	// yields NaN, which the `if ms < 1` clamp below cannot catch (every
	// comparison against NaN is false), and int64(NaN)/int64(±Inf) is
	// target-dependent (WorldMillis(0) on arm64,
	// WorldMillis(math.MinInt64) on amd64). Zero is deliberately NOT
	// guarded here — it is neither non-finite nor negative and keeps
	// taking the existing ratio=0/seconds=0/ms=0 path to the 1ms floor.
	// Unreachable today (the sole caller passes a positive
	// ContinuousRadius); this is a defensive guard on a dead path, hence
	// panic rather than a sentinel error (see design discussion at the
	// call site / tasks.md 9.7).
	if math.IsNaN(radius) || math.IsInf(radius, 0) || radius < 0 {
		panic(fmt.Sprintf("keplerPeriodMs: non-finite or negative radius %v", radius))
	}
	ratio := radius / KeplerBaseRadius
	sqrtRatio := math.Sqrt(ratio) // determinism:allow(pinned) family:keplerPeriodMs — correctly-rounded, identical across every Go build target (design.md Decision 3; precedent space/park.go). Pinned by fixtures/system/cases.json's keplerPeriodMs family over radius in [0, 1e9]; radius < 0 is DELIBERATELY EXCLUDED (NaN->int64 is architecture-dependent), recorded in that family's mirror-map note as a reported defect
	seconds := float64(float64(KeplerBaseSeconds*ratio) * sqrtRatio)
	ms := math.Ceil(float64(seconds * 1000))
	if ms < 1 {
		ms = 1
	}
	return common.WorldMillis(int64(ms))
}

// starSizeByClass is the pinned table over galaxy.rollStarClass's classes
// (design.md Decision 4). The ceiling is load-bearing: every entry must
// satisfy space.StarClearanceRadius(size) < BaseOrbitRadius, i.e.
// size < BaseOrbitRadius/starClearanceFactor = 9.6 — widening this table
// past that without moving BaseOrbitRadius puts a planet inside its own
// star's burn-clearance shell (TestCalibration_Scenario_NoStarSizePlacesBodyInsideClearanceShell
// asserts the bound, reading space.StarClearanceRadius directly rather than
// a copied factor).
var starSizeByClass = map[string]float64{
	"O": 7.6, "B": 7.0, "A": 6.6, "F": 6.2, "G": 6.0, "K": 5.6, "M": 5.2,
}

// defaultStarSize is the named default for a star class this table does not
// recognize (design.md Decision 4's PoC-carried default).
const defaultStarSize float64 = 6.0

// StarSize is a pinned, pure function of star class — never drawn, never
// seeded (design.md Decision 4): a K-class dwarf reads as one, and deriving
// it costs no RNG draw.
func StarSize(class string) float64 {
	if s, ok := starSizeByClass[class]; ok {
		return s
	}
	return defaultStarSize
}

// featureSizeBands are the per-FeatureType size bands a feature's Size is
// drawn from on the continuous stream (design.md Decision 4). Keyed on
// FeatureType, not one global band, so a gas giant can never roll smaller
// than a rocky world and so MaxFeatureSize can ceiling each type
// independently. Star, belt (the feature itself), station, and belt members
// are not in this table — see StarSize, BeltFeatureSize, StationSize, and
// beltMemberOrbit respectively.
var featureSizeBands = map[FeatureType][2]float64{
	FeatureGasGiant:    {3.4, 4.2},
	FeatureIce:         {1.9, 2.7},
	FeatureRocky:       {1.6, 2.4},
	FeatureMoon:        {0.5, 1.0},
	FeatureAnomaly:     {0.8, 1.6},
	FeatureRuin:        {0.8, 1.6},
	FeatureGravityWell: {1.0, 3.0},
	FeatureRadiation:   {1.0, 3.0},
	FeatureNebula:      {1.0, 3.0},
	FeatureDebris:      {1.0, 3.0},
}

// MaxFeatureSize is the exported, pure per-type size ceiling table (design.md
// Decision 4) — reachable from a bare galaxy-tier body type via
// featureTypeForBody, with no interior read, which is exactly what lets
// Decision 6's station derivation stay pure.
func MaxFeatureSize(ft FeatureType) float64 {
	if band, ok := featureSizeBands[ft]; ok {
		return band[1]
	}
	switch ft {
	case FeatureBelt:
		return BeltFeatureSize
	case FeatureStation:
		return StationSize
	default:
		return 0
	}
}

// drawFeatureSize draws a feature's Size from its type's band on the
// continuous stream (design.md Decision 4). A belt's own size is a named
// constant, not drawn. Any type with no configured band (the star; a belt
// member, drawn separately by beltMemberOrbit) returns 0 — callers never
// route those types through this function.
func drawFeatureSize(ft FeatureType, r2 *rand.Rand) float64 {
	if ft == FeatureBelt {
		return BeltFeatureSize
	}
	band, ok := featureSizeBands[ft]
	if !ok {
		return 0
	}
	lo, hi := band[0], band[1]
	return float64(lo + float64(r2.Float64()*(hi-lo)))
}

// MoonOrbitLocalRadius is the named band law a body-parented child's local
// radius follows (design.md Decision 16): parentSize +
// InsertionStandoff(parent) + MoonOrbitMin + u*(MoonOrbitMax-MoonOrbitMin),
// with u drawn from the continuous stream. Both the clearance terms and the
// band are named constants — see MoonOrbitMin/MoonOrbitMax's own doc for the
// inequalities this law's output is bound by.
func MoonOrbitLocalRadius(parent space.Body, u float64) float64 {
	clearance := float64(parent.Size + space.InsertionStandoff(parent))
	band := float64(MoonOrbitMin + float64(u*(MoonOrbitMax-MoonOrbitMin)))
	return float64(clearance + band)
}

// wrapSubTurnFraction maps a [0,1) fraction onto a SubTurns angle — exact
// for the fraction values this package draws (u < 1 strictly, and
// multiplying by the exact power-of-two SubTurn cannot round up past it).
func wrapSubTurnFraction(u float64) space.SubTurns {
	return space.SubTurns(int64(float64(u * float64(space.SubTurn))))
}

// inclinationFor derives a continuous inclination from a side (prograde or
// retrograde) and a [0,1) jitter fraction (design.md Decisions 1, 17):
// prograde draws near 0, retrograde draws near SubTurn/2, both bounded
// strictly inside MaxInclinationJitter of their respective pole so the two
// bands never touch.
func inclinationFor(retrograde bool, jitterFrac float64) space.SubTurns {
	jitter := space.SubTurns(int64(float64(jitterFrac * float64(MaxInclinationJitter))))
	if retrograde {
		return space.SubTurn/2 - jitter
	}
	return jitter
}

// continuousStarParented draws and attaches a star-parented feature's
// continuous element set and size, from the continuous stream r2
// (design.md Decisions 1-4, 17). orbitalIndex is the per-family index
// ContinuousRadius consumes (see its own doc for the three sources).
//
// dir is the body's orbital side (+1 prograde in the system's disk, -1
// against it), decided ONCE by the caller on the PRIMARY stream — either
// straight from DominantOrbitDirection for a disk-born body, or from
// diskOrCaptured's roll for a capture-plausible one — and passed in rather
// than re-rolled here. Only the inclination jitter's MAGNITUDE comes from the
// continuous stream. That split is what keeps the side a property of which
// bodies the system generated, not of how big they turned out.
func continuousStarParented(f *Feature, orbitalIndex, dir int, r2 *rand.Rand) {
	radius := ContinuousRadius(orbitalIndex)
	period := keplerPeriodMs(radius)
	incl := inclinationFor(dir < 0, r2.Float64())
	phase := wrapSubTurnFraction(r2.Float64())
	node := wrapSubTurnFraction(r2.Float64())
	f.Space = &space.Orbit{
		ParentId:    "feat-star",
		Radius:      radius,
		PeriodMs:    period,
		Phase:       phase,
		Inclination: incl,
		Node:        node,
	}
	f.Size = drawFeatureSize(f.Type, r2)
}
